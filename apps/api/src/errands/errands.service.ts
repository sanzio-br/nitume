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
  budgetFor,
  deriveUrgency,
} from './errand-rules';
import { ApiError, conflict } from '../common/api-error';
import { feesFor } from '../common/fees';

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
  /**
   * "Total (service + runner fee)" of the current quote (row 34), as a
   * 2-decimal string; null until quoted. The component split stays internal.
   */
  feeTotal: string | null;
  /** True once the merchant/admin set Till/Paybill details (rows 42-44). */
  merchantDetailsAvailable: boolean;
  /** Expiry of the newest quote, or null (not quoted / never expires) (N-5). */
  quoteExpiresAt: Date | null;
  /**
   * True when the errand is ACCEPTED but its newest quote (an admin re-quote,
   * row 72) has not been accepted yet: the customer must accept it
   * (POST /errands/:id/quote/accept) before paying.
   */
  quoteAcceptanceRequired: boolean;
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

/**
 * 409 `quote_expired` when the quote has an expiry that has passed (BOARD
 * row 46). A quote without `expiresAt` never expires. The customer needs a
 * fresh quote (admin re-quote) before accepting or paying.
 */
export const assertQuoteCurrent = (
  quote: Pick<Quote, 'id' | 'expiresAt'> | null,
  now: Date = new Date(),
): void => {
  if (quote?.expiresAt && quote.expiresAt.getTime() <= now.getTime()) {
    throw new ApiError(
      HttpStatus.CONFLICT,
      'quote_expired',
      'This quote has expired. A fresh quote is needed before you can accept or pay.',
      { quoteId: quote.id, expiresAt: quote.expiresAt.toISOString() },
    );
  }
};

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

/**
 * Runs inside the re-quote transaction, after the errand row is locked;
 * throwing refuses the re-quote (e.g. a payment is already in flight).
 */
export type RequoteGuard = (manager: EntityManager, errandId: string) => Promise<void>;

/** Domain event emitted after an admin re-quote commits (N-4, row 72). */
export const QUOTE_REISSUED_EVENT = 'quote.reissued';

export interface QuoteReissuedEvent {
  errandId: string;
  quoteId: string;
  total: string;
  currency: string;
  expiresAt: string | null;
  status: ErrandStatus;
  /** True on an ACCEPTED errand: the customer must accept the new quote. */
  acceptanceRequired: boolean;
}

/** Domain event emitted after merchant Till/Paybill details are set. */
export const MERCHANT_DETAILS_UPDATED_EVENT = 'errand.merchant_details_updated';

export interface MerchantDetailsUpdatedEvent {
  errandId: string;
  merchantName: string | null;
  tillNumber: string | null;
  paybillNumber: string | null;
  accountReference: string | null;
}

/** States in which an admin may replace an expired quote (rows 46, 72). */
const REQUOTABLE = new Set<ErrandStatus>([ErrandStatus.QUOTED, ErrandStatus.ACCEPTED]);

/** An admin dispute resolution about to commit (see `onDisputeResolved`). */
export interface DisputeResolutionInTx {
  errandId: string;
  verdict: 'runner_favourable' | 'customer_favourable';
  rationale: string;
  adminUserId: string;
}

/** Runs inside the resolve-dispute transaction; throwing rolls it back. */
export type DisputeResolutionHook = (
  manager: EntityManager,
  resolution: DisputeResolutionInTx,
) => Promise<void>;

@Injectable()
export class ErrandsService {
  private readonly afterCommit = new WeakMap<EntityManager, StatusChangedEvent[]>();
  private readonly cancellationHooks: CancellationHook[] = [];
  private readonly disputeResolutionHooks: DisputeResolutionHook[] = [];
  private readonly requoteGuards: RequoteGuard[] = [];

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
    const budget = budgetFor(dto.category, dto.budget);
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
        budget: budget.toFixed(2),
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
        ...this.derivedFields(saved, null),
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

  /** Newest quote row of an errand, or null (no access check). */
  async currentQuote(errandId: string, manager?: EntityManager): Promise<Quote | null> {
    const repo = manager ? manager.getRepository(Quote) : this.quotes;
    return repo.findOne({ where: { errandId }, order: { createdAt: 'DESC' } });
  }

  /** Throws 409 `quote_expired` when the errand's newest quote has expired. */
  async assertQuoteCurrentFor(errandId: string, manager?: EntityManager): Promise<void> {
    assertQuoteCurrent(await this.currentQuote(errandId, manager));
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

  private derivedFields(
    errand: Errand,
    quote: Pick<Quote, 'expiresAt' | 'acceptedAt'> | null,
  ): Pick<
    ErrandView,
    'feeTotal' | 'merchantDetailsAvailable' | 'quoteExpiresAt' | 'quoteAcceptanceRequired'
  > {
    const feeTotal =
      errand.quotedPrice === null || errand.quotedPrice === undefined
        ? null
        : feesFor(Number(errand.quotedPrice), {
            serviceFeeRate: this.config?.get<number>('pricing.serviceFeeRate', 0.2) ?? 0.2,
            runnerFeeRate: this.config?.get<number>('pricing.runnerFeeRate', 0.3) ?? 0.3,
          }).total.toFixed(2);
    return {
      feeTotal,
      merchantDetailsAvailable: Boolean(errand.merchantTillNumber || errand.merchantPaybillNumber),
      quoteExpiresAt: quote?.expiresAt ?? null,
      quoteAcceptanceRequired:
        errand.status === ErrandStatus.ACCEPTED && quote !== null && !quote.acceptedAt,
    };
  }

  private async withAssignments(errands: Errand[]): Promise<ErrandView[]> {
    if (errands.length === 0) {
      return [];
    }
    const ids = errands.map((e) => e.id);
    const [rows, locationRows, itemRows, quoteRows] = await Promise.all([
      this.assignments.find({
        where: {
          errandId: In(ids),
          status: In(ACTIVE_ASSIGNMENT_STATUSES),
        },
        order: { createdAt: 'DESC' },
      }),
      this.locations.find({ where: { errandId: In(ids) } }),
      this.items.find({ where: { errandId: In(ids) } }),
      this.quotes.find({
        where: { errandId: In(ids) },
        select: { id: true, errandId: true, expiresAt: true, acceptedAt: true, createdAt: true },
        order: { createdAt: 'DESC' },
      }),
    ]);
    const newestQuote = new Map<string, Quote>();
    for (const q of quoteRows) {
      if (!newestQuote.has(q.errandId)) {
        newestQuote.set(q.errandId, q);
      }
    }
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
        ...this.derivedFields(errand, newestQuote.get(errand.id) ?? null),
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
   * Admin sets the merchant Till/Paybill details used by the merchant_direct
   * route (rows 42-44). Exactly one of Till or Paybill; an account reference
   * only goes with a Paybill. Not allowed once the errand is closed.
   */
  async setMerchantDetails(
    errandId: string,
    details: {
      merchantName: string;
      tillNumber?: string;
      paybillNumber?: string;
      accountReference?: string;
    },
  ): Promise<Errand> {
    const errand = await this.getById(errandId);
    if (ErrandStateMachine.isTerminal(errand.status)) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'errand_closed',
        `The task is ${errand.status} and can no longer be edited`,
      );
    }
    const till = details.tillNumber ?? null;
    const paybill = details.paybillNumber ?? null;
    if ((till === null) === (paybill === null)) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'merchant_details_invalid',
        'Give either a Till number or a Paybill number, not both',
      );
    }
    if (details.accountReference && paybill === null) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'merchant_details_invalid',
        'An account reference only goes with a Paybill number',
      );
    }
    const patch = {
      merchantName: details.merchantName,
      merchantTillNumber: till,
      merchantPaybillNumber: paybill,
      merchantAccountReference: paybill ? (details.accountReference ?? null) : null,
    };
    await this.errands.update(errandId, patch);
    const event: MerchantDetailsUpdatedEvent = {
      errandId,
      merchantName: patch.merchantName,
      tillNumber: patch.merchantTillNumber,
      paybillNumber: patch.merchantPaybillNumber,
      accountReference: patch.merchantAccountReference,
    };
    setImmediate(() => this.events.emit(MERCHANT_DETAILS_UPDATED_EVENT, event));
    return Object.assign(errand, patch);
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
      throw conflict(
        'rationale_too_short',
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
      throw conflict(
        'errand_not_disputed',
        `Only DISPUTED errands can be mediated (got ${errand.status})`,
        { status: errand.status },
      );
    }
    const to =
      verdict === 'runner_favourable'
        ? ErrandStatus.COMPLETED
        : ErrandStatus.CANCELLED;
    const result = await this.performTransition(manager, errandId, to, {
      type: StatusHistoryActor.ADMIN,
      id: actor.userId,
    }, note, { role: actor.role, userId: actor.userId });
    for (const hook of this.disputeResolutionHooks) {
      await hook(manager, { errandId, verdict, rationale: note, adminUserId: actor.userId });
    }
    return result;
  }

  /**
   * Registers work that commits atomically with an admin dispute resolution
   * (N-6): the disputes module closes its `disputes` row there, without
   * errands depending on disputes.
   */
  onDisputeResolved(hook: DisputeResolutionHook): void {
    this.disputeResolutionHooks.push(hook);
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
      throw conflict('illegal_transition', `Illegal status transition: ${fromStatus} -> ${to}`, {
        from: fromStatus,
        to,
      });
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
    let acceptedQuote: Quote | null = null;
    if (fromStatus === ErrandStatus.QUOTED && to === ErrandStatus.ACCEPTED) {
      acceptedQuote = await this.currentQuote(errandId, manager);
      assertQuoteCurrent(acceptedQuote);
    }

    errand.status = to;
    try {
      await manager.getRepository(Errand).save(errand);
    } catch (err) {
      if (err instanceof Error) {
        throw conflict(
          'concurrent_modification',
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

    // Accepting a quoted errand records acceptance on the quote it accepted
    // (row 72: payment needs the newest quote to be accepted).
    if (acceptedQuote && !acceptedQuote.acceptedAt) {
      acceptedQuote.acceptedAt = new Date();
      await manager.getRepository(Quote).update(acceptedQuote.id, {
        acceptedAt: acceptedQuote.acceptedAt,
      });
    }

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
   * older than the dispute window (errands.disputeWindowHours). Run by the
   * `dispute-window` job on the maintenance queue (rows 26, 50). The window
   * counts from the latest COMPLETED entry, so it restarts after a dispute
   * resolves back to COMPLETED. Returns the ids it confirmed.
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

  /** Ids of errands in a status, oldest first (system jobs only, no access check). */
  async idsInStatus(status: ErrandStatus, limit = 100): Promise<string[]> {
    const rows = await this.errands.find({
      where: { status },
      select: { id: true },
      order: { updatedAt: 'ASC' },
      take: limit,
    });
    return rows.map((r) => r.id);
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
   *
   * Re-quote (BOARD rows 46, 72): on a QUOTED or ACCEPTED errand whose newest
   * quote has expired, the same call writes a fresh quote row and updates
   * the quoted price without a status change (no history row; the quotes
   * table is the audit trail). The newest quote always supersedes older
   * ones. On ACCEPTED the new quote starts unaccepted, so the customer must
   * accept it (`acceptQuote`) before paying, and the re-quote is refused
   * while a payment is in flight (requote guards, `payment_in_progress`).
   * A quote that is still valid is not replaced (409 `quote_still_valid`).
   * Emits `quote.reissued` after commit (N-4).
   */
  async quote(
    errandId: string,
    quote: QuoteInput,
    actor: ActorReference,
    note?: string,
  ): Promise<{ errand: Errand; history: ErrandStatusHistory | null; quote: Quote }> {
    const out = await this.inTx(async (manager) => {
      const current = await manager.getRepository(Errand).findOne({
        where: { id: errandId },
        lock: { mode: 'pessimistic_write' },
      });
      if (current && REQUOTABLE.has(current.status)) {
        if (actor.type !== StatusHistoryActor.ADMIN && actor.type !== StatusHistoryActor.SYSTEM) {
          throw new ForbiddenException(`Actor '${actor.type}' cannot re-quote an errand`);
        }
        const latest = await this.currentQuote(errandId, manager);
        if (!latest?.expiresAt || latest.expiresAt.getTime() > Date.now()) {
          throw new ApiError(
            HttpStatus.CONFLICT,
            'quote_still_valid',
            'The current quote has not expired; only an expired quote can be replaced',
            { quoteId: latest?.id ?? null, expiresAt: latest?.expiresAt?.toISOString() ?? null },
          );
        }
        for (const guard of this.requoteGuards) {
          await guard(manager, errandId);
        }
        const row = await this.saveQuote(manager, errandId, quote);
        current.quotedPrice = quote.total.toFixed(2);
        await manager.getRepository(Errand).update(errandId, { quotedPrice: current.quotedPrice });
        return { errand: current, history: null, quote: row, reissued: true };
      }
      const done = await this.performTransition(
        manager,
        errandId,
        ErrandStatus.QUOTED,
        actor,
        note,
      );
      const quotedPrice = quote.total.toFixed(2);
      await manager.getRepository(Errand).update(errandId, { quotedPrice });
      done.errand.quotedPrice = quotedPrice;
      const row = await this.saveQuote(manager, errandId, quote);
      return { errand: done.errand, history: done.history, quote: row, reissued: false };
    });
    if (out.reissued) {
      const event: QuoteReissuedEvent = {
        errandId,
        quoteId: out.quote.id,
        total: Number(out.quote.total).toFixed(2),
        currency: out.quote.currency,
        expiresAt: out.quote.expiresAt?.toISOString() ?? null,
        status: out.errand.status,
        acceptanceRequired: out.errand.status === ErrandStatus.ACCEPTED,
      };
      setImmediate(() => this.events.emit(QUOTE_REISSUED_EVENT, event));
    }
    return { errand: out.errand, history: out.history, quote: out.quote };
  }

  /**
   * Registers a check that runs inside every re-quote transaction (row 72).
   * The payments module refuses a re-quote while a payment is in flight.
   */
  onRequote(guard: RequoteGuard): void {
    this.requoteGuards.push(guard);
  }

  /**
   * Customer accepts the errand's newest quote (row 72):
   * - QUOTED: the usual QUOTED -> ACCEPTED transition (acceptance recorded
   *   on the quote).
   * - ACCEPTED: records acceptance of an admin re-quote on the quote row; no
   *   status change. Idempotent when the newest quote is already accepted.
   * 409 `quote_expired` on an expired quote, `quote_not_acceptable` in any
   * other status; 404 when the errand has no quote.
   */
  async acceptQuote(
    errandId: string,
    viewer: ViewerContext,
  ): Promise<{ errand: ErrandView; quote: Quote }> {
    await this.getById(errandId, viewer);
    const quote = await this.inTx(async (manager) => {
      const errand = await manager.getRepository(Errand).findOne({
        where: { id: errandId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!errand) {
        throw new NotFoundException('Errand not found');
      }
      const latest = await this.currentQuote(errandId, manager);
      if (!latest) {
        throw new NotFoundException('Errand has not been quoted yet');
      }
      if (errand.status === ErrandStatus.QUOTED) {
        await this.performTransition(
          manager,
          errandId,
          ErrandStatus.ACCEPTED,
          { type: StatusHistoryActor.CUSTOMER, id: viewer.userId },
          'Quote accepted',
          viewer,
        );
        return (await this.currentQuote(errandId, manager)) ?? latest;
      }
      if (errand.status !== ErrandStatus.ACCEPTED) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'quote_not_acceptable',
          `A quote cannot be accepted while the task is ${errand.status}`,
          { status: errand.status },
        );
      }
      await this.enforceSubject(
        manager,
        errand,
        { type: StatusHistoryActor.CUSTOMER, id: viewer.userId },
        viewer,
      );
      if (latest.acceptedAt) {
        return latest;
      }
      assertQuoteCurrent(latest);
      latest.acceptedAt = new Date();
      await manager.getRepository(Quote).update(latest.id, { acceptedAt: latest.acceptedAt });
      return latest;
    });
    return { errand: await this.getDetail(errandId, viewer), quote };
  }

  /**
   * The quote a payment may be taken against (row 72). With `manager` it is
   * checked inside the caller's transaction with the errand row locked, so a
   * concurrent re-quote cannot slip in between the check and the payment
   * insert (without, it is a lock-free pre-check). The
   * newest quote, unexpired (409 `quote_expired`) and accepted by the
   * customer (409 `quote_not_accepted`).
   */
  async payableQuote(errandId: string, manager?: EntityManager): Promise<Quote> {
    if (manager) {
      await manager.getRepository(Errand).findOne({
        where: { id: errandId },
        lock: { mode: 'pessimistic_write' },
      });
    }
    const latest = await this.currentQuote(errandId, manager);
    if (!latest) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'errand_not_quoted', 'Errand has not been quoted yet');
    }
    assertQuoteCurrent(latest);
    if (!latest.acceptedAt) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'quote_not_accepted',
        'A new quote was issued; accept it before paying',
        { quoteId: latest.id, total: Number(latest.total).toFixed(2) },
      );
    }
    return latest;
  }

  private saveQuote(manager: EntityManager, errandId: string, quote: QuoteInput): Promise<Quote> {
    const quoteRepo = manager.getRepository(Quote);
    return quoteRepo.save(
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