import {
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  In,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import {
  ErrandStatus,
  GeoPoint,
  StatusHistoryActor,
  AssignmentStatus,
  UserRole,
} from '../common/enums';
import { AuthContext } from '../common/decorators/auth.decorators';
import { CustomerProfile } from '../customers/customer-profile.entity';
import { RunnerProfile } from '../runners/runner-profile.entity';
import {
  RunnerPublicSummary,
  RunnersService,
} from '../runners/runners.service';
import { ErrandAssignment } from './errand-assignment.entity';
import { ErrandItem } from './errand-item.entity';
import { ErrandLocation } from './errand-location.entity';
import { ErrandStateMachine, TransitionGuard } from './errand-state-machine';
import { ErrandStatusHistory } from './errand-status-history.entity';
import { Errand } from './errand.entity';
import { Quote } from './quote.entity';
import {
  CreateErrandDto,
  ErrandItemDto,
  ErrandLocationDto,
} from './dto/errand.dto';
import {
  assertDeadlineInFuture,
  assertLocationsFit,
  deriveUrgency,
} from './errand-rules';
import { ApiError } from '../common/api-error';

export interface ActorReference {
  type: StatusHistoryActor;
  id?: string | null;
}

export interface ViewerContext {
  role: string;
  userId: string;
}

export interface QuoteInput {
  total: number;
  baseFee?: number;
  distanceFee?: number;
  timeFee?: number;
  urgencyFee?: number;
  complexityFee?: number;
  premiumFee?: number;
  currency?: string;
  expiresAt?: string;
}

export interface ErrandResult {
  errand: Errand;
  history: ErrandStatusHistory;
}

export interface ListErrandsResponse {
  items: Errand[];
  nextCursor: string | null;
}

/** Assignment states that mean "this runner holds the errand". */
export const ACTIVE_ASSIGNMENT_STATUSES: AssignmentStatus[] = [
  AssignmentStatus.ASSIGNED,
  AssignmentStatus.ACCEPTED,
];

/** Customer-facing view of the runner currently holding an errand. */
export interface ErrandAssignmentView {
  id: string;
  status: AssignmentStatus;
  /** When the assignment was decided (falls back to creation time). */
  assignedAt: Date;
  runner: RunnerPublicSummary | null;
}

/** Errand point as returned to clients (`lat`/`lng`, not GeoJSON). */
export interface ErrandLocationView {
  id: string;
  pointType: ErrandLocation['pointType'];
  lat: number;
  lng: number;
  addressText: string;
  placeId: string | null;
}

/** Structured shopping-list line. */
export interface ErrandItemView {
  id: string;
  name: string;
  quantity: number;
  unit: string | null;
  notes: string | null;
}

/**
 * Errand row plus its locations, shopping-list items and current assignment
 * (null until a runner is assigned).
 */
export type ErrandView = Errand & {
  assignment: ErrandAssignmentView | null;
  locations: ErrandLocationView[];
  items: ErrandItemView[];
};

/** States in which the assigned runner may write `runnerNotes`. */
export const RUNNER_NOTES_STATES = new Set<ErrandStatus>([
  ErrandStatus.ARRIVED,
  ErrandStatus.IN_PROGRESS,
  ErrandStatus.AWAITING_CUSTOMER,
]);

export const toLocationView = (row: ErrandLocation): ErrandLocationView => ({
  id: row.id,
  pointType: row.pointType,
  lat: row.coordinates.coordinates[1],
  lng: row.coordinates.coordinates[0],
  addressText: row.addressText,
  placeId: row.placeId,
});

export const toItemView = (row: ErrandItem): ErrandItemView => ({
  id: row.id,
  name: row.name,
  quantity: row.quantity,
  unit: row.unit,
  notes: row.notes,
});

export interface ListErrandViewsResponse {
  items: ErrandView[];
  nextCursor: string | null;
}

const pointToGeo = (loc: ErrandLocationDto): GeoPoint => ({
  type: 'Point',
  coordinates: [loc.lon, loc.lat],
});

interface StatusChangedEvent {
  errandId: string;
  status: ErrandStatus;
  from: ErrandStatus;
  actor: StatusHistoryActor;
}

/** A CANCELLED transition about to commit (see `onCancelled`). */
export interface CancellationInTx {
  errandId: string;
  from: ErrandStatus;
  actor: StatusHistoryActor;
  guard?: TransitionGuard;
}

/**
 * Runs inside the transaction that moves an errand to CANCELLED. Throwing
 * rolls the cancellation back, so work done here is never lost after commit.
 */
export type CancellationHook = (manager: EntityManager, change: CancellationInTx) => Promise<void>;

@Injectable()
export class ErrandsService {
  private readonly afterCommit = new WeakMap<EntityManager, StatusChangedEvent[]>();
  private readonly cancellationHooks: CancellationHook[] = [];

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Errand)
    private readonly errands: Repository<Errand>,
    @InjectRepository(ErrandLocation)
    private readonly locations: Repository<ErrandLocation>,
    @InjectRepository(ErrandItem)
    private readonly items: Repository<ErrandItem>,
    @InjectRepository(ErrandStatusHistory)
    private readonly history: Repository<ErrandStatusHistory>,
    @InjectRepository(ErrandAssignment)
    private readonly assignments: Repository<ErrandAssignment>,
    @InjectRepository(CustomerProfile)
    private readonly customerProfiles: Repository<CustomerProfile>,
    @InjectRepository(RunnerProfile)
    private readonly runnerProfiles: Repository<RunnerProfile>,
    private readonly events: EventEmitter2,
    private readonly runners: RunnersService,
    @InjectRepository(Quote)
    private readonly quotes: Repository<Quote>,
    private readonly config?: ConfigService,
  ) {}

  private urgencyThresholds() {
    return {
      urgentWithinHours: this.config?.get<number>('errands.urgentWithinHours', 4) ?? 4,
      scheduledAfterHours: this.config?.get<number>('errands.scheduledAfterHours', 72) ?? 72,
    };
  }

  async createDraft(
    customerUserId: string,
    dto: CreateErrandDto,
    actor: ActorReference,
  ): Promise<{ errand: ErrandView; history: ErrandStatusHistory }> {
    const deadlineAt = dto.deadlineAt ? new Date(dto.deadlineAt) : null;
    assertDeadlineInFuture(deadlineAt);
    assertLocationsFit(
      dto.category,
      dto.locations.map((l) => l.pointType),
    );
    return this.inTx(async (manager) => {
      const profile = await manager
        .getRepository(CustomerProfile)
        .findOne({ where: { userId: customerUserId } });
      if (!profile) {
        throw new ForbiddenException('Customer profile not found');
      }

      const errand = manager.getRepository(Errand).create({
        customerId: profile.id,
        category: dto.category,
        title: dto.title ?? null,
        description: dto.description,
        budget: dto.budget.toString(),
        deadlineAt,
        // Client-sent `urgency` is ignored: deadline_at is authoritative.
        urgency: deriveUrgency(deadlineAt, this.urgencyThresholds()),
        status: ErrandStatus.DRAFT,
      });
      const saved = await manager.getRepository(Errand).save(errand);

      const locationRows = dto.locations.map((loc) =>
        manager.getRepository(ErrandLocation).create({
          errandId: saved.id,
          pointType: loc.pointType,
          coordinates: pointToGeo(loc),
          addressText: loc.addressText,
          placeId: loc.placeId ?? null,
        }),
      );
      const savedLocations = await manager.getRepository(ErrandLocation).save(locationRows);

      let savedItems: ErrandItem[] = [];
      if (dto.items && dto.items.length > 0) {
        const itemRows = dto.items.map((item: ErrandItemDto) =>
          manager.getRepository(ErrandItem).create({
            errandId: saved.id,
            name: item.name,
            quantity: item.quantity ?? 1,
            unit: item.unit ?? null,
            notes: item.notes ?? null,
          }),
        );
        savedItems = await manager.getRepository(ErrandItem).save(itemRows);
      }

      const history = await this.appendHistory(manager, saved.id, {
        fromStatus: null,
        toStatus: ErrandStatus.DRAFT,
        actor: { type: actor.type, id: actor.id ?? null },
        note: 'Errand created as draft',
      });

      const view: ErrandView = Object.assign(saved, {
        assignment: null,
        locations: savedLocations.map(toLocationView),
        items: savedItems.map(toItemView),
      });
      return { errand: view, history };
    });
  }

  async getById(
    errandId: string,
    viewer?: ViewerContext,
  ): Promise<Errand> {
    const errand = await this.errands.findOne({ where: { id: errandId } });
    if (!errand) {
      throw new NotFoundException('Errand not found');
    }
    if (viewer && !(await this.canView(errand, viewer))) {
      throw new ForbiddenException('You do not have access to this errand');
    }
    return errand;
  }

  /**
   * Latest quote breakdown for an errand, readable by anyone who can view the
   * errand (owner customer, assigned runner, admin). 404 until quoted.
   */
  async latestQuoteFor(errandId: string, viewer: ViewerContext): Promise<Quote> {
    await this.getById(errandId, viewer);
    const quote = await this.quotes.findOne({
      where: { errandId },
      order: { createdAt: 'DESC' },
    });
    if (!quote) {
      throw new NotFoundException('Errand has not been quoted yet');
    }
    return quote;
  }

  /** `getById` plus the current assignment and public runner summary. */
  async getDetail(errandId: string, viewer: ViewerContext): Promise<ErrandView> {
    const errand = await this.getById(errandId, viewer);
    const [view] = await this.withAssignments([errand]);
    return view;
  }

  /** `listFor` with each item carrying its current assignment (batched). */
  async listViewsFor(
    viewer: ViewerContext,
    opts: { status?: ErrandStatus | ErrandStatus[]; limit?: number; cursor?: string | null },
  ): Promise<ListErrandViewsResponse> {
    const page = await this.listFor(viewer, opts);
    return {
      items: await this.withAssignments(page.items),
      nextCursor: page.nextCursor,
    };
  }

  /** Pickup / drop-off / task-site points of an errand (no access check). */
  async locationsFor(errandId: string): Promise<ErrandLocation[]> {
    return this.locations.find({ where: { errandId } });
  }

  /**
   * Current (assigned/accepted) assignment for an errand, or null. Public so
   * other modules (location, realtime) go through this service instead of
   * reading `errand_assignments` themselves.
   */
  async activeAssignmentFor(errandId: string): Promise<ErrandAssignment | null> {
    return this.assignments.findOne({
      where: { errandId, status: In(ACTIVE_ASSIGNMENT_STATUSES) },
      order: { createdAt: 'DESC' },
    });
  }

  private async withAssignments(errands: Errand[]): Promise<ErrandView[]> {
    if (errands.length === 0) {
      return [];
    }
    const ids = errands.map((e) => e.id);
    const [rows, locationRows, itemRows] = await Promise.all([
      this.assignments.find({
        where: {
          errandId: In(ids),
          status: In(ACTIVE_ASSIGNMENT_STATUSES),
        },
        order: { createdAt: 'DESC' },
      }),
      this.locations.find({ where: { errandId: In(ids) } }),
      this.items.find({ where: { errandId: In(ids) } }),
    ]);
    const locationsBy = groupBy(locationRows, (l) => l.errandId);
    const itemsBy = groupBy(itemRows, (i) => i.errandId);
    const latest = new Map<string, ErrandAssignment>();
    for (const row of rows) {
      if (!latest.has(row.errandId)) {
        latest.set(row.errandId, row);
      }
    }
    const summaries = await this.runners.publicSummaries(
      [...latest.values()].map((a) => a.runnerProfileId),
    );
    return errands.map((errand) => {
      const a = latest.get(errand.id);
      const assignment: ErrandAssignmentView | null = a
        ? {
            id: a.id,
            status: a.status,
            assignedAt: a.decidedAt ?? a.createdAt,
            runner: summaries.get(a.runnerProfileId) ?? null,
          }
        : null;
      return Object.assign(errand, {
        assignment,
        locations: (locationsBy.get(errand.id) ?? []).map(toLocationView),
        items: (itemsBy.get(errand.id) ?? []).map(toItemView),
      });
    });
  }

  /**
   * Owner customer edits the optional title. Not allowed once the errand is
   * in a terminal state.
   */
  async updateTitle(
    errandId: string,
    title: string | null,
    viewer: ViewerContext,
  ): Promise<ErrandView> {
    const errand = await this.getById(errandId, viewer);
    if (viewer.role !== UserRole.CUSTOMER && viewer.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only the task owner can edit the title');
    }
    if (ErrandStateMachine.isTerminal(errand.status)) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'errand_closed',
        `The task is ${errand.status} and can no longer be edited`,
      );
    }
    await this.errands.update(errandId, { title: title && title.length > 0 ? title : null });
    return this.getDetail(errandId, viewer);
  }

  /**
   * Assigned runner writes the notes the customer reads on evidence review
   * (ARRIVED, IN_PROGRESS or AWAITING_CUSTOMER).
   */
  async setRunnerNotes(
    errandId: string,
    runnerNotes: string | null,
    viewer: ViewerContext,
  ): Promise<ErrandView> {
    const errand = await this.getById(errandId, viewer);
    const active = await this.isCurrentRunner(errandId, viewer.userId);
    if (!active) {
      throw new ForbiddenException('Only the assigned runner can write runner notes');
    }
    if (!RUNNER_NOTES_STATES.has(errand.status)) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'runner_notes_not_allowed',
        `Runner notes cannot be changed while the task is ${errand.status}`,
      );
    }
    await this.errands.update(errandId, {
      runnerNotes: runnerNotes && runnerNotes.length > 0 ? runnerNotes : null,
    });
    return this.getDetail(errandId, viewer);
  }

  /**
   * True when `userId` is the runner on the errand's CURRENT assignment (the
   * newest assigned/accepted row). A past assignment (declined, expired or
   * superseded by a newer one) grants nothing (BOARD rows 27, 65). Public so
   * other modules (evidence, price change, location) share one rule.
   */
  async isCurrentRunner(errandId: string, userId: string): Promise<boolean> {
    const runnerProfile = await this.runnerProfiles.findOne({ where: { userId } });
    if (!runnerProfile) {
      return false;
    }
    const current = await this.activeAssignmentFor(errandId);
    return current !== null && current.runnerProfileId === runnerProfile.id;
  }

  async listFor(
    viewer: ViewerContext,
    opts: { status?: ErrandStatus | ErrandStatus[]; limit?: number; cursor?: string | null },
  ): Promise<ListErrandsResponse> {
    const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
    const qb = await this.scopedQuery(viewer, opts.status);

    qb.orderBy('e."createdAt"', 'DESC').addOrderBy('e.id', 'DESC').limit(limit + 1);

    const decoded = decodeCursor(opts.cursor);
    if (decoded) {
      const [createdAt, id] = decoded;
      qb.andWhere(
        '(e."createdAt" < :createdAt OR (e."createdAt" = :createdAt AND e.id < :id))',
        { createdAt: new Date(createdAt), id },
      );
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page,
      nextCursor: hasMore && last ? encodeCursor(last) : null,
    };
  }

  /**
   * Number of errands visible to the viewer, with the same scoping and status
   * filter as `listFor` (customers never see their DRAFTs).
   */
  async countFor(
    viewer: ViewerContext,
    status?: ErrandStatus | ErrandStatus[],
  ): Promise<{ count: number }> {
    const qb = await this.scopedQuery(viewer, status);
    return { count: await qb.getCount() };
  }

  /** Viewer-scoped errand query with an optional one-or-many status filter. */
  private async scopedQuery(
    viewer: ViewerContext,
    status?: ErrandStatus | ErrandStatus[],
  ): Promise<SelectQueryBuilder<Errand>> {
    const statuses = normalizeStatuses(status);
    const qb = this.errands.createQueryBuilder('e');

    if (viewer.role === 'runner') {
      const runnerProfile = await this.runnerProfiles.findOne({
        where: { userId: viewer.userId },
      });
      if (!runnerProfile) {
        throw new ForbiddenException('Runner profile not found');
      }
      // Only errands where this runner holds the current assignment (the
      // newest assigned/accepted row); past assignments are not listed.
      qb.innerJoin(
        ErrandAssignment,
        'a',
        `a.id = (SELECT a2.id FROM "errand_assignments" a2
                  WHERE a2."errandId" = e.id AND a2.status IN (:...activeAssignment)
                  ORDER BY a2."createdAt" DESC LIMIT 1)
         AND a."runnerProfileId" = :runnerProfileId`,
        { runnerProfileId: runnerProfile.id, activeAssignment: ACTIVE_ASSIGNMENT_STATUSES },
      );
    } else if (viewer.role !== 'admin') {
      const profile = await this.customerProfiles.findOne({
        where: { userId: viewer.userId },
      });
      if (!profile) {
        throw new ForbiddenException('Customer profile not found');
      }
      qb.where('e."customerId" = :profileId', { profileId: profile.id });
      qb.andWhere('e.status != :draft', { draft: ErrandStatus.DRAFT });
    }

    if (statuses.length === 1) {
      qb.andWhere('e.status = :status', { status: statuses[0] });
    } else if (statuses.length > 1) {
      qb.andWhere('e.status IN (:...statuses)', { statuses });
    }
    return qb;
  }

  /**
   * Admin dispute resolution. Runner-favourable returns the errand to
   * COMPLETED (normal payout process); customer-favourable cancels it, which
   * opens a refund review in the payments module when the customer had paid.
   */
  async resolveDispute(
    errandId: string,
    verdict: 'runner_favourable' | 'customer_favourable',
    rationale: string,
    actor: AuthContext,
  ): Promise<ErrandResult> {
    const note = rationale.trim();
    if (note.length < 20) {
      throw new ConflictException(
        'Mediation requires a written rationale of at least 20 characters (§A.6 audit).',
      );
    }
    return this.inTx((manager) =>
      this.performDisputeResolution(manager, errandId, verdict, note, actor),
    );
  }

  private async performDisputeResolution(
    manager: EntityManager,
    errandId: string,
    verdict: 'runner_favourable' | 'customer_favourable',
    note: string,
    actor: AuthContext,
  ): Promise<ErrandResult> {
    if (actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only an admin may mediate a dispute');
    }
    const errand = await manager.getRepository(Errand).findOne({
      where: { id: errandId },
    });
    if (!errand) {
      throw new NotFoundException('Errand not found');
    }
    if (errand.status !== ErrandStatus.DISPUTED) {
      throw new ConflictException(`Only DISPUTED errands can be mediated (got ${errand.status})`);
    }
    const to =
      verdict === 'runner_favourable'
        ? ErrandStatus.COMPLETED
        : ErrandStatus.CANCELLED;
    return this.performTransition(manager, errandId, to, {
      type: StatusHistoryActor.ADMIN,
      id: actor.userId,
    }, note, { role: actor.role, userId: actor.userId });
  }

  /**
   * Registers work that must commit atomically with every CANCELLED
   * transition, whichever flow cancels (customer cancel, admin cancel,
   * price-change rejection, customer-favourable dispute resolution). Used by
   * the payments module to open refund reviews without errands depending on
   * payments.
   */
  onCancelled(hook: CancellationHook): void {
    this.cancellationHooks.push(hook);
  }

  /**
   * Transitions an errand to a target status, validating against the strict
   * state machine and recording a history row (append-only). Uses the entity
   * version column for optimistic concurrency: concurrent transitions from
   * the same version surface as a retryable conflict. `guard` must be passed
   * by the one flow allowed to perform a guarded transition.
   */
  async transition(
    errandId: string,
    to: ErrandStatus,
    actor: ActorReference,
    note?: string,
    subject?: ViewerContext,
    guard?: TransitionGuard,
  ): Promise<ErrandResult> {
    return this.inTx((manager) =>
      this.performTransition(manager, errandId, to, actor, note, subject, guard),
    );
  }

  /**
   * Same as `transition`, but runs `within` in the same database transaction
   * after the status row is written, so another module can persist its own
   * rows atomically with the status change (e.g. disputes). The callback
   * owns its repositories through the manager it is given.
   */
  async transitionWith<T>(
    errandId: string,
    to: ErrandStatus,
    actor: ActorReference,
    note: string | undefined,
    subject: ViewerContext | undefined,
    within: (manager: EntityManager, result: ErrandResult) => Promise<T>,
    guard?: TransitionGuard,
  ): Promise<ErrandResult & { extra: T }> {
    return this.inTx(async (manager) => {
      const result = await this.performTransition(
        manager,
        errandId,
        to,
        actor,
        note,
        subject,
        guard,
      );
      const extra = await within(manager, result);
      return { ...result, extra };
    });
  }

  private async performTransition(
    manager: EntityManager,
    errandId: string,
    to: ErrandStatus,
    actor: ActorReference,
    note?: string,
    subject?: ViewerContext,
    guard?: TransitionGuard,
  ): Promise<ErrandResult> {
    const errand = await manager.getRepository(Errand).findOne({
      where: { id: errandId },
    });
    if (!errand) {
      throw new NotFoundException('Errand not found');
    }
    const fromStatus = errand.status;
    if (!ErrandStateMachine.canTransition(fromStatus, to)) {
      throw new ConflictException(
        `Illegal status transition: ${fromStatus} -> ${to}`,
      );
    }
    const required = ErrandStateMachine.guardFor(fromStatus, to);
    if (required && required !== guard) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        `transition_requires_${required}`,
        `${fromStatus} -> ${to} is only allowed through ${required.replace(/_/g, ' ')}`,
      );
    }
    if (!ErrandStateMachine.actorCanPerform(fromStatus, to, actor.type)) {
      throw new ForbiddenException(
        `Actor '${actor.type}' cannot perform ${fromStatus} -> ${to}`,
      );
    }
    await this.enforceSubject(manager, errand, actor, subject);

    errand.status = to;
    try {
      await manager.getRepository(Errand).save(errand);
    } catch (err) {
      if (err instanceof Error) {
        throw new ConflictException(
          'Concurrent modification detected. Retry the transition.',
        );
      }
      throw err;
    }

    const history = await this.appendHistory(manager, errandId, {
      fromStatus,
      toStatus: to,
      actor: { type: actor.type, id: actor.id ?? null },
      note: note ?? null,
    });

    if (to === ErrandStatus.CANCELLED) {
      for (const hook of this.cancellationHooks) {
        await hook(manager, { errandId, from: fromStatus, actor: actor.type, guard });
      }
    }

    // Emitted only after the surrounding transaction commits (see inTx), so
    // listeners never read the pre-transition row.
    const queued = this.afterCommit.get(manager) ?? [];
    queued.push({ errandId, status: to, from: fromStatus, actor: actor.type });
    this.afterCommit.set(manager, queued);

    return { errand, history };
  }

  /**
   * Runs `fn` in a transaction and, once it has committed, emits the
   * `errand.status_changed` events queued by `performTransition`. A rollback
   * drops them.
   */
  private async inTx<T>(fn: (manager: EntityManager) => Promise<T>): Promise<T> {
    let used: EntityManager | undefined;
    const result = await this.dataSource.transaction((manager) => {
      used = manager;
      return fn(manager);
    });
    const queued = used ? (this.afterCommit.get(used) ?? []) : [];
    if (used) {
      this.afterCommit.delete(used);
    }
    for (const event of queued) {
      setImmediate(() => this.events.emit('errand.status_changed', event));
    }
    return result;
  }

  /**
   * System step COMPLETED -> CONFIRMED for errands whose COMPLETED entry is
   * older than the dispute window (errands.disputeWindowHours). Meant to be
   * run by a scheduled job; nothing schedules it yet (queue infrastructure
   * pending, BOARD row 26). Returns the ids it confirmed.
   */
  async confirmPastDisputeWindow(now: Date = new Date()): Promise<string[]> {
    const hours = this.config?.get<number>('errands.disputeWindowHours', 24) ?? 24;
    const cutoff = new Date(now.getTime() - hours * 3_600_000);
    const due = await this.errands
      .createQueryBuilder('e')
      .select('e.id', 'id')
      .where('e.status = :completed', { completed: ErrandStatus.COMPLETED })
      .andWhere(
        `(SELECT MAX(h."createdAt") FROM "errand_status_history" h
           WHERE h."errandId" = e.id AND h."toStatus" = :completed) <= :cutoff`,
        { cutoff },
      )
      .getRawMany<{ id: string }>();
    const confirmed: string[] = [];
    for (const { id } of due) {
      try {
        await this.transition(
          id,
          ErrandStatus.CONFIRMED,
          { type: StatusHistoryActor.SYSTEM },
          `Dispute window of ${hours}h passed`,
        );
        confirmed.push(id);
      } catch (err) {
        // Disputed or modified meanwhile: skip, the next run re-checks.
        if (!(err instanceof ConflictException) && !(err instanceof ApiError)) {
          throw err;
        }
      }
    }
    return confirmed;
  }

  async historyFor(errandId: string): Promise<ErrandStatusHistory[]> {
    return this.history.find({
      where: { errandId },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Admin quote step: prices the errand and moves REQUESTED -> QUOTED in one
   * transaction. The quoted price is captured on the errand; the full
   * breakdown lands in `quotes` (auditable pricing provenance).
   */
  async quote(
    errandId: string,
    quote: QuoteInput,
    actor: ActorReference,
    note?: string,
  ): Promise<{ errand: Errand; history: ErrandStatusHistory; quote: Quote }> {
    return this.inTx(async (manager) => {
      const done = await this.performTransition(
        manager,
        errandId,
        ErrandStatus.QUOTED,
        actor,
        note,
      );
      const errandRepo = manager.getRepository(Errand);
      const quotedPrice = quote.total.toFixed(2);
      await errandRepo.update(errandId, { quotedPrice });
      done.errand.quotedPrice = quotedPrice;
      const quoteRepo = manager.getRepository(Quote);
      const row = await quoteRepo.save(
        quoteRepo.create({
          errandId,
          baseFee: (quote.baseFee ?? quote.total).toString(),
          distanceFee: (quote.distanceFee ?? 0).toString(),
          timeFee: (quote.timeFee ?? 0).toString(),
          urgencyFee: (quote.urgencyFee ?? 0).toString(),
          complexityFee: (quote.complexityFee ?? 0).toString(),
          premiumFee: (quote.premiumFee ?? 0).toString(),
          total: quote.total.toString(),
          currency: quote.currency ?? 'KES',
          expiresAt: quote.expiresAt ? new Date(quote.expiresAt) : null,
        }),
      );
      return { errand: done.errand, history: done.history, quote: row };
    });
  }

  /**
   * v1 semi-automated matching: the admin's one-click assignment. Creates an
   * accepted assignment for the runner and moves PAYMENT_CONFIRMED ->
   * RUNNER_ASSIGNED in the same transaction.
   */
  async assign(
    errandId: string,
    runnerProfileId: string,
    actor: ActorReference,
    note?: string,
  ): Promise<{ errand: Errand; history: ErrandStatusHistory; assignment: ErrandAssignment }> {
    return this.inTx(async (manager) => {
      const runner = await manager
        .getRepository(RunnerProfile)
        .findOne({ where: { id: runnerProfileId } });
      if (!runner) {
        throw new NotFoundException('Runner profile not found');
      }
      const done = await this.performTransition(
        manager,
        errandId,
        ErrandStatus.RUNNER_ASSIGNED,
        actor,
        note,
      );
      const assignmentRepo = manager.getRepository(ErrandAssignment);
      const assignment = await assignmentRepo.save(
        assignmentRepo.create({
          errandId,
          runnerProfileId,
          status: AssignmentStatus.ASSIGNED,
          decidedAt: new Date(),
        }),
      );
      return { errand: done.errand, history: done.history, assignment };
    });
  }

  private async customerProfileIdFor(
    manager: EntityManager,
    userId: string,
  ): Promise<string | null> {
    const row = await manager
      .getRepository(CustomerProfile)
      .findOne({ where: { userId } });
    return row?.id ?? null;
  }

  private async canView(errand: Errand, viewer: ViewerContext): Promise<boolean> {
    if (viewer.role === 'admin') {
      return true;
    }
    if (viewer.role === 'runner') {
      return this.isCurrentRunner(errand.id, viewer.userId);
    }
    const ownerProfileId = await this.customerProfileIdFor(
      this.mutableEntityManager(),
      viewer.userId,
    );
    return ownerProfileId === errand.customerId;
  }

  /**
   * Alias for customerProfileIdFor outside the transaction path (getById is
   * not transactional). Reads require no in-tx entity manager semantics.
   */
  private mutableEntityManager(): EntityManager {
    return this.errands.manager;
  }

  /** Public lookup for cross-module access checks (e.g. evidence, ratings). */
  async getCustomerProfileId(userId: string): Promise<string | null> {
    return this.customerProfileIdFor(this.mutableEntityManager(), userId);
  }

  /**
   * Subject-bound access control: a customer may only act on their own
   * errand; a runner only on errands they hold an active assignment for;
   * admins/system are subject-free.
   */
  private async enforceSubject(
    manager: EntityManager,
    errand: Errand,
    actor: ActorReference,
    subject?: ViewerContext,
  ): Promise<void> {
    switch (actor.type) {
      case StatusHistoryActor.CUSTOMER: {
        const profileId = subject
          ? await this.customerProfileIdFor(manager, subject.userId)
          : actor.id ?? null;
        if (profileId !== errand.customerId) {
          throw new ForbiddenException('You do not own this errand');
        }
        break;
      }
      case StatusHistoryActor.RUNNER: {
        const runnerProfile = subject
          ? await manager
              .getRepository(RunnerProfile)
              .findOne({ where: { userId: subject.userId } })
          : null;
        const runnerProfileId = runnerProfile?.id ?? actor.id ?? null;
        if (!runnerProfileId) {
          throw new ForbiddenException('Runner identity missing');
        }
        const assignment = await manager
          .getRepository(ErrandAssignment)
          .createQueryBuilder('a')
          .where('a."errandId" = :errandId', { errandId: errand.id })
          .andWhere('a."runnerProfileId" = :runnerProfileId', { runnerProfileId })
          .andWhere("a.status IN ('assigned', 'accepted')")
          .getOne();
        if (!assignment) {
          throw new ForbiddenException('You are not assigned to this errand');
        }
        break;
      }
      case StatusHistoryActor.ADMIN:
      case StatusHistoryActor.SYSTEM:
        break;
    }
  }

  private async appendHistory(
    manager: EntityManager,
    errandId: string,
    data: {
      fromStatus: ErrandStatus | null;
      toStatus: ErrandStatus;
      actor: { type: StatusHistoryActor; id: string | null };
      note: string | null;
    },
  ): Promise<ErrandStatusHistory> {
    const repo = manager.getRepository(ErrandStatusHistory);
    const row = repo.create({
      errandId,
      fromStatus: data.fromStatus,
      toStatus: data.toStatus,
      actorType: data.actor.type,
      actorId: data.actor.id,
      note: data.note,
    });
    return repo.save(row);
  }
}

const groupBy = <T>(rows: T[], key: (row: T) => string): Map<string, T[]> => {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = out.get(k);
    if (list) {
      list.push(row);
    } else {
      out.set(k, [row]);
    }
  }
  return out;
};

const normalizeStatuses = (
  status: ErrandStatus | ErrandStatus[] | undefined,
): ErrandStatus[] => {
  if (!status) {
    return [];
  }
  return [...new Set(Array.isArray(status) ? status : [status])];
};

const encodeCursor = (errand: Errand): string =>
  Buffer.from(
    `${errand.createdAt.toISOString()}::${errand.id}`,
    'utf-8',
  ).toString('base64');

const decodeCursor = (
  cursor: string | null | undefined,
): [string, string] | null => {
  if (!cursor) {
    return null;
  }
  try {
    const [createdAt, id] = Buffer.from(cursor, 'base64').toString('utf-8').split('::');
    if (!createdAt || !id) {
      return null;
    }
    return [createdAt, id];
  } catch {
    return null;
  }
};