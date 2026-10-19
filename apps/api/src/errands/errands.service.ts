import {
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
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
  AssignmentDeclineReason,
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
  assertMerchantCategory,
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
  /**
   * Acceptance deadline of the offer (rows 114, 141, 157): after it the
   * runner can no longer accept, the assignment becomes `expired` and the
   * task stays RUNNER_ASSIGNED for the admin to offer to another runner.
   * Null on older assignments. Only an open offer (`status: assigned`, task
   * RUNNER_ASSIGNED) can lapse; on an `accepted` assignment it is kept for
   * the record.
   */
  offerExpiresAt: Date | null;
  /** When the offer was made (the assignment row's creation). */
  offeredAt: Date;
  /** When the runner accepted or declined, or the offer expired; null while open (row 157, N-20). */
  decidedAt: Date | null;
  /** Why the runner declined (row 108); null unless `declined`. */
  declineReason: AssignmentDeclineReason | null;
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
  /**
   * Admin detail only (row 157, drawer-task-offer): every assignment of the
   * task, newest first, whatever its status (open, accepted, declined,
   * expired), for "Earlier offers" and to skip runners already offered.
   */
  assignments?: ErrandAssignmentView[];
  /**
   * Admin views only (detail and list, row 157): the newest assignment
   * whatever its status, so ops see an open, declined or expired offer and
   * know when to reassign. `assignment` keeps its meaning (current holder
   * only, null after a decline or lapse) for every role.
   */
  lastAssignment?: ErrandAssignmentView | null;
  /** Admin detail only: the admin offer window in seconds (MATCHING_ADMIN_OFFER_WINDOW_SECONDS). */
  offerWindowSeconds?: number;
  /**
   * Admin views (row 185): true when `deadlineAt` is at or before now and
   * the task is still RUNNER_ASSIGNED or PAYMENT_CONFIRMED (no runner
   * accepted). False without a deadline.
   */
  deadlinePassed?: boolean;
  /** Admin detail of an EXPIRED task: how it expired. Null otherwise. */
  expiry?: ErrandExpiryView | null;
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

export interface ListOptions {
  status?: ErrandStatus | ErrandStatus[];
  limit?: number;
  cursor?: string | null;
  /** true: only errands with a pending "Request a new quote" (row 68). */
  quoteRequested?: boolean;
}

export interface ListErrandViewsResponse {
  items: ErrandView[];
  nextCursor: string | null;
}

/**
 * 409 `quote_expired` when the quote has an expiry that has passed (BOARD
 * row 46). Every quote has an expiry (row 83; legacy nulls backfilled). A
 * null expiry, should one appear, is treated as never expiring. The customer needs a fresh quote (admin re-quote)
 * before accepting or paying.
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

/**
 * Terminal statuses a paid task can end in without being delivered
 * (row 102): each opens a refund review through `onTerminated`.
 */
export const REFUNDABLE_TERMINAL_STATUSES: readonly ErrandStatus[] = [
  ErrandStatus.CANCELLED,
  ErrandStatus.EXPIRED,
  ErrandStatus.FAILED,
];

/** A CANCELLED transition about to commit (see `onCancelled`). */
export interface CancellationInTx {
  errandId: string;
  from: ErrandStatus;
  actor: StatusHistoryActor;
  guard?: TransitionGuard;
}

/** A CANCELLED, EXPIRED or FAILED transition about to commit (see `onTerminated`). */
export interface TerminationInTx extends CancellationInTx {
  to: ErrandStatus;
}

/**
 * Runs inside the transaction that moves an errand to CANCELLED. Throwing
 * rolls the cancellation back, so work done here is never lost after commit.
 */
export type CancellationHook = (manager: EntityManager, change: CancellationInTx) => Promise<void>;

/**
 * Runs inside the transaction that moves an errand to CANCELLED, EXPIRED or
 * FAILED. Throwing rolls the transition back.
 */
export type TerminationHook = (manager: EntityManager, change: TerminationInTx) => Promise<void>;

/** A COMPLETED -> CONFIRMED transition about to commit (see `onConfirmed`). */
export interface ConfirmationInTx {
  errandId: string;
  from: ErrandStatus;
  actor: StatusHistoryActor;
}

/**
 * Runs inside the transaction that moves an errand to CONFIRMED (system,
 * after the dispute window). Throwing rolls the confirmation back, so work
 * done here commits with it or not at all.
 */
export type ConfirmationHook = (manager: EntityManager, change: ConfirmationInTx) => Promise<void>;

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

/** Domain event emitted after a customer asks for a new quote (row 68). */
export const QUOTE_REQUESTED_EVENT = 'quote.requested';

export interface QuoteRequestedEvent {
  errandId: string;
  reference: string;
  /** The expired quote the customer wants replaced. */
  quoteId: string;
  status: ErrandStatus;
  quoteRequestedAt: string;
}

/** Domain event emitted after merchant Till/Paybill details are set. */
export const MERCHANT_DETAILS_UPDATED_EVENT = 'errand.merchant_details_updated';

export interface MerchantDetailsUpdatedEvent {
  errandId: string;
  merchantName: string | null;
  tillNumber: string | null;
  paybillNumber: string | null;
  accountReference: string | null;
  /**
   * True when details already existed and this call changed them (row 80);
   * false on the first entry or when nothing changed.
   */
  changed: boolean;
  /** Set when `changed`: the errand's new merchantDetailsUpdatedAt. */
  merchantDetailsUpdatedAt: string | null;
}

/** Domain event emitted after a runner declines an assignment (row 108). */
export const ASSIGNMENT_DECLINED_EVENT = 'assignment.declined';

/** Row 185: the sweep expired a RUNNER_ASSIGNED task at its customer deadline (admin feed `deadline_passed`). */
export const TASK_DEADLINE_EXPIRED_EVENT = 'errand.deadline_expired';

export interface TaskDeadlineExpiredEvent {
  errandId: string;
  reference: string;
  deadlineAt: string;
  /** The offer that was still open and closed with the task (row 205 proposal), else null. */
  closedOffer: { assignmentId: string; runnerProfileId: string } | null;
}

/** History note of the row-185 expiry; also how `expiry.trigger` is recognised. */
export const DEADLINE_EXPIRY_NOTE = 'Customer deadline passed';

/** How an EXPIRED task got there (admin views, round-11 item 6), derived from its history row. */
export interface ErrandExpiryView {
  /** `deadline_passed` (row 185) | `admin` | `system` (any other system expiry, e.g. pre-round-9 offer lapses). */
  trigger: 'deadline_passed' | 'admin' | 'system';
  at: Date;
  by: { id: string; displayName: string | null } | null;
  note: string | null;
}

/** History row with its actor's display name (round-11 item 6). */
export type ErrandHistoryView = ErrandStatusHistory & { actor: { id: string; displayName: string | null } | null };

/** Row 157: the offer-expiry job expired an admin offer; the task waits for a new runner. */
export const ASSIGNMENT_EXPIRED_EVENT = 'assignment.expired';

export interface AssignmentExpiredEvent {
  errandId: string;
  reference: string;
  assignmentId: string;
  runnerProfileId: string;
  offerExpiresAt: string;
}

export interface AssignmentDeclinedEvent {
  errandId: string;
  reference: string;
  assignmentId: string;
  runnerProfileId: string;
  /** `over_purchase_limit` (row 108) or null (no reason given, row 113). */
  reason: AssignmentDeclineReason | null;
}

/**
 * Runs inside the decline transaction (errand row locked); throwing refuses
 * the decline. The matching module checks the purchase limit here.
 */
export type DeclineGuard = (
  manager: EntityManager,
  ctx: { errandId: string; runnerProfileId: string; reason: AssignmentDeclineReason | null },
) => Promise<void>;

/**
 * Runs inside the runner's accept transaction (errand and runner profile
 * locked, RUNNER_ASSIGNED -> RUNNER_EN_ROUTE); throwing refuses the accept.
 * The matching module checks the purchase limit here (rows 113, 186).
 */
export type AcceptGuard = (
  manager: EntityManager,
  ctx: { errandId: string; runnerProfileId: string },
) => Promise<void>;

/**
 * Runs inside the admin assign transaction (errand locked) before the offer
 * is written; throwing refuses the assign. Matching checks the runner's
 * eligibility here (row 186: purchase limit).
 */
export type AssignGuard = (
  manager: EntityManager,
  ctx: { errandId: string; runnerProfileId: string },
) => Promise<void>;

/**
 * RA-20: states in which the accepted runner is on the job, so the runner
 * is `busy` (one active job at a time). Leaving this set (AWAITING_CUSTOMER,
 * FAILED, CANCELLED, DISPUTED) frees the runner.
 */
export const RUNNER_ACTIVE_JOB_STATES: ReadonlySet<ErrandStatus> = new Set([
  ErrandStatus.RUNNER_EN_ROUTE,
  ErrandStatus.ARRIVED,
  ErrandStatus.IN_PROGRESS,
]);

/** Row 185: the task's customer deadline has passed (deadlineAt null = no deadline). */
export const deadlinePassed = (errand: Pick<Errand, 'deadlineAt'>, now: Date = new Date()): boolean =>
  !!errand.deadlineAt && errand.deadlineAt.getTime() <= now.getTime();

const deadlinePassedFor = (e: Pick<Errand, 'status' | 'deadlineAt'>): boolean =>
  (e.status === ErrandStatus.RUNNER_ASSIGNED || e.status === ErrandStatus.PAYMENT_CONFIRMED) && deadlinePassed(e);

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
  private readonly terminationHooks: TerminationHook[] = [];
  private readonly confirmationHooks: ConfirmationHook[] = [];
  private readonly disputeResolutionHooks: DisputeResolutionHook[] = [];
  private readonly requoteGuards: RequoteGuard[] = [];
  private readonly acceptGuards: AcceptGuard[] = [];
  private readonly assignGuards: AssignGuard[] = [];

  private readonly logger = new Logger(ErrandsService.name);

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
    @Optional() private readonly users?: UsersService,
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
    if (viewer.role === UserRole.RUNNER) {
      // RA-2: the quote carries the service fee and the customer's total.
      throw new ForbiddenException('Runners do not see the customer quote');
    }
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
    const [view] = await this.withAssignments([errand], viewer);
    if (viewer.role === UserRole.ADMIN) {
      const all = await this.assignments.find({ where: { errandId }, order: { createdAt: 'DESC', id: 'DESC' } });
      const summaries = await this.runners.publicSummaries([...new Set(all.map((a) => a.runnerProfileId))]);
      view.assignments = all.map((a) => toAssignmentView(a, summaries.get(a.runnerProfileId) ?? null));
      view.lastAssignment = view.assignments[0] ?? null;
      view.offerWindowSeconds = this.adminOfferWindowSeconds();
      view.deadlinePassed = deadlinePassedFor(view);
      view.expiry = view.status === ErrandStatus.EXPIRED ? await this.expiryOf(errandId) : null;
    }
    return view;
  }

  /** The RUNNER_ASSIGNED -> EXPIRED history row as an expiry view (admin, round-11 item 6). */
  private async expiryOf(errandId: string): Promise<ErrandExpiryView | null> {
    const row = await this.history.findOne({
      where: { errandId, toStatus: ErrandStatus.EXPIRED },
      order: { createdAt: 'DESC' },
    });
    if (!row) {
      return null;
    }
    const names = row.actorId && this.users ? await this.users.displayNames([row.actorId]) : new Map<string, string>();
    return {
      trigger:
        row.actorType === StatusHistoryActor.ADMIN
          ? 'admin'
          : row.note === DEADLINE_EXPIRY_NOTE
            ? 'deadline_passed'
            : 'system',
      at: row.createdAt,
      by: row.actorId ? { id: row.actorId, displayName: names.get(row.actorId) ?? null } : null,
      note: row.note ?? null,
    };
  }

  /**
   * `GET /errands/:id/history` (round-11 item 6). Admin viewers get each
   * row's `actor { id, displayName }` (null for system rows). Customers and
   * runners get the plain rows: no actor names (reviewer B2).
   */
  async historyViewsFor(errandId: string, viewer: ViewerContext): Promise<ErrandStatusHistory[] | ErrandHistoryView[]> {
    const rows = await this.historyFor(errandId);
    if (viewer.role !== UserRole.ADMIN) {
      return rows;
    }
    const ids = [...new Set(rows.map((r) => r.actorId).filter((v): v is string => !!v))];
    const names = ids.length > 0 && this.users ? await this.users.displayNames(ids) : new Map<string, string>();
    return rows.map((r) =>
      Object.assign(r, { actor: r.actorId ? { id: r.actorId, displayName: names.get(r.actorId) ?? null } : null }),
    );
  }

  /** `listFor` with each item carrying its current assignment (batched). */
  async listViewsFor(
    viewer: ViewerContext,
    opts: ListOptions,
  ): Promise<ListErrandViewsResponse> {
    const page = await this.listFor(viewer, opts);
    const items = await this.withAssignments(page.items, viewer);
    if (viewer.role === UserRole.ADMIN && items.length > 0) {
      await this.attachLastAssignments(items);
      for (const item of items) {
        item.deadlinePassed = deadlinePassedFor(item);
      }
    }
    return { items, nextCursor: page.nextCursor };
  }

  /** Errand rows by id (no access check; for admin read models elsewhere). */
  async findByIds(ids: string[]): Promise<Errand[]> {
    const unique = [...new Set(ids)].filter(Boolean);
    return unique.length === 0 ? [] : this.errands.find({ where: { id: In(unique) } });
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
  async activeAssignmentFor(errandId: string, manager?: EntityManager): Promise<ErrandAssignment | null> {
    const repo = manager ? manager.getRepository(ErrandAssignment) : this.assignments;
    return repo.findOne({
      where: { errandId, status: In(ACTIVE_ASSIGNMENT_STATUSES) },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Errand ids each runner was ever assigned to (any assignment status), for
   * other modules' read models (disputes: the ID-image purge guard, row 175).
   */
  async errandIdsByRunner(runnerProfileIds: string[], manager?: EntityManager): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    const unique = [...new Set(runnerProfileIds)].filter(Boolean);
    if (unique.length === 0) {
      return out;
    }
    const repo = manager ? manager.getRepository(ErrandAssignment) : this.assignments;
    const rows = await repo.find({
      where: { runnerProfileId: In(unique) },
      select: { errandId: true, runnerProfileId: true },
    });
    for (const r of rows) {
      const list = out.get(r.runnerProfileId) ?? [];
      if (!list.includes(r.errandId)) {
        list.push(r.errandId);
      }
      out.set(r.runnerProfileId, list);
    }
    return out;
  }

  /**
   * The runner's latest assignment on an errand, whatever its status (audit
   * records, row 151). Null when the runner was never assigned.
   */
  async latestAssignmentOf(
    errandId: string,
    runnerProfileId: string,
    manager?: EntityManager,
  ): Promise<ErrandAssignment | null> {
    const repo = manager ? manager.getRepository(ErrandAssignment) : this.assignments;
    return repo.findOne({ where: { errandId, runnerProfileId }, order: { createdAt: 'DESC' } });
  }

  /**
   * RA-1: open offers of a runner, newest first: RUNNER_ASSIGNED errands
   * whose current assignment is this runner's `assigned` offer, still open
   * (no deadline, or `offerExpiresAt` in the future) and before the task's
   * own deadline (row 185). Cursor over the offer's creation (opaque).
   */
  async openOffersFor(
    runnerProfileId: string,
    opts: { limit?: number; cursor?: string | null; now?: Date } = {},
  ): Promise<{ items: { errand: Errand; assignment: ErrandAssignment }[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
    const now = opts.now ?? new Date();
    const qb = this.assignments
      .createQueryBuilder('a')
      .innerJoin(Errand, 'e', 'e.id = a."errandId"')
      .where('a."runnerProfileId" = :runnerProfileId', { runnerProfileId })
      .andWhere('a.status = :open', { open: AssignmentStatus.ASSIGNED })
      .andWhere('e.status = :assigned', { assigned: ErrandStatus.RUNNER_ASSIGNED })
      .andWhere('(a."offerExpiresAt" IS NULL OR a."offerExpiresAt" > :now)', { now })
      .andWhere('(e."deadlineAt" IS NULL OR e."deadlineAt" > :now)', { now })
      .andWhere(
        `a.id = (SELECT a2.id FROM "errand_assignments" a2 WHERE a2."errandId" = a."errandId"
                  ORDER BY a2."createdAt" DESC, a2.id DESC LIMIT 1)`,
      )
      .orderBy('a."createdAt"', 'DESC')
      .addOrderBy('a.id', 'DESC')
      .limit(limit + 1);
    const decoded = decodeCursor(opts.cursor);
    if (decoded) {
      qb.andWhere('(a."createdAt", a.id) < (:cAt, :cId)', { cAt: new Date(decoded[0]), cId: decoded[1] });
    }
    const rows = await qb.getMany();
    const page = rows.slice(0, limit);
    const errands = page.length === 0 ? [] : await this.errands.find({ where: { id: In(page.map((a) => a.errandId)) } });
    const byId = new Map(errands.map((e) => [e.id, e]));
    const last = page[page.length - 1];
    return {
      items: page.flatMap((a) => {
        const errand = byId.get(a.errandId);
        return errand ? [{ errand, assignment: a }] : [];
      }),
      nextCursor:
        rows.length > limit && last
          ? Buffer.from(`${last.createdAt.toISOString()}::${last.id}`, 'utf-8').toString('base64')
          : null,
    };
  }

  /** Locations and items of errands (no access check), for runner projections. */
  async locationsAndItemsFor(
    errandIds: string[],
  ): Promise<{ locations: Map<string, ErrandLocationView[]>; items: Map<string, ErrandItemView[]> }> {
    const ids = [...new Set(errandIds)].filter(Boolean);
    if (ids.length === 0) {
      return { locations: new Map(), items: new Map() };
    }
    const [locationRows, itemRows] = await Promise.all([
      this.locations.find({ where: { errandId: In(ids) } }),
      this.items.find({ where: { errandId: In(ids) } }),
    ]);
    const locations = new Map<string, ErrandLocationView[]>();
    for (const [k, rows] of groupBy(locationRows, (l) => l.errandId)) {
      locations.set(k, rows.map(toLocationView));
    }
    const items = new Map<string, ErrandItemView[]>();
    for (const [k, rows] of groupBy(itemRows, (i) => i.errandId)) {
      items.set(k, rows.map(toItemView));
    }
    return { locations, items };
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

  /** Admin list (row 157): the newest assignment of each errand, any status, batched. */
  private async attachLastAssignments(items: ErrandView[]): Promise<void> {
    const rows = await this.assignments
      .createQueryBuilder('a')
      .distinctOn(['a."errandId"'])
      .where('a."errandId" IN (:...ids)', { ids: items.map((e) => e.id) })
      .orderBy('a."errandId"')
      .addOrderBy('a."createdAt"', 'DESC')
      .addOrderBy('a.id', 'DESC')
      .getMany();
    const summaries = await this.runners.publicSummaries([...new Set(rows.map((a) => a.runnerProfileId))]);
    const byErrand = new Map(rows.map((a) => [a.errandId, a]));
    for (const item of items) {
      const a = byErrand.get(item.id);
      item.lastAssignment = a ? toAssignmentView(a, summaries.get(a.runnerProfileId) ?? null) : null;
    }
  }

  /**
   * Row 183 (owner, 2026-10-16): a customer never sees the offered runner
   * (name, map marker, ETA) before the runner accepts. For a customer viewer
   * `assignment` is the current assignment only once it is `accepted`, else
   * null. Admin and runner views keep the current (open or accepted) one.
   */
  private async withAssignments(errands: Errand[], viewer?: ViewerContext): Promise<ErrandView[]> {
    const customer = viewer?.role === UserRole.CUSTOMER;
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
    // Row 183 (reviewer B1): for a customer, an assignment not marked
    // `accepted` is shown only when the history proves the runner accepted
    // (RUNNER_ASSIGNED -> RUNNER_EN_ROUTE; assignments accepted before
    // round 7 stayed `assigned`). Never because the task merely moved on
    // (cancelled or expired before any accept).
    const unproven = customer
      ? [...latest.values()].filter((a) => a.status !== AssignmentStatus.ACCEPTED).map((a) => a.errandId)
      : [];
    const acceptedInHistory = new Set(
      unproven.length === 0
        ? []
        : (
            await this.history.find({
              where: {
                errandId: In(unproven),
                fromStatus: ErrandStatus.RUNNER_ASSIGNED,
                toStatus: ErrandStatus.RUNNER_EN_ROUTE,
              },
              select: { errandId: true },
            })
          ).map((h) => h.errandId),
    );
    return errands.map((errand) => {
      const a = latest.get(errand.id);
      const assignment: ErrandAssignmentView | null =
        a && (!customer || a.status === AssignmentStatus.ACCEPTED || acceptedInHistory.has(errand.id))
          ? toAssignmentView(a, summaries.get(a.runnerProfileId) ?? null)
          : null;
      const view = Object.assign(errand, {
        assignment,
        locations: (locationsBy.get(errand.id) ?? []).map(toLocationView),
        items: (itemsBy.get(errand.id) ?? []).map(toItemView),
        ...this.derivedFields(errand, newestQuote.get(errand.id) ?? null),
      });
      return viewer?.role === UserRole.RUNNER ? withoutCustomerPricing(view) : view;
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
    assertMerchantCategory(errand.category, 'merchant_details_not_applicable');
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
    const hadDetails = Boolean(errand.merchantTillNumber || errand.merchantPaybillNumber);
    const changed =
      hadDetails &&
      (errand.merchantName !== patch.merchantName ||
        errand.merchantTillNumber !== patch.merchantTillNumber ||
        errand.merchantPaybillNumber !== patch.merchantPaybillNumber ||
        (errand.merchantAccountReference ?? null) !== patch.merchantAccountReference);
    const update: Partial<Errand> = changed
      ? { ...patch, merchantDetailsUpdatedAt: new Date() }
      : patch;
    await this.errands.update(errandId, update);
    const event: MerchantDetailsUpdatedEvent = {
      errandId,
      merchantName: patch.merchantName,
      tillNumber: patch.merchantTillNumber,
      paybillNumber: patch.merchantPaybillNumber,
      accountReference: patch.merchantAccountReference,
      changed,
      merchantDetailsUpdatedAt: update.merchantDetailsUpdatedAt?.toISOString() ?? null,
    };
    setImmediate(() => this.events.emit(MERCHANT_DETAILS_UPDATED_EVENT, event));
    return Object.assign(errand, update);
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

  async listFor(viewer: ViewerContext, opts: ListOptions): Promise<ListErrandsResponse> {
    const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
    const qb = await this.scopedQuery(viewer, opts.status, opts.quoteRequested);

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
    quoteRequested?: boolean,
  ): Promise<{ count: number }> {
    const qb = await this.scopedQuery(viewer, status, quoteRequested);
    return { count: await qb.getCount() };
  }

  /** Viewer-scoped errand query with an optional one-or-many status filter. */
  private async scopedQuery(
    viewer: ViewerContext,
    status?: ErrandStatus | ErrandStatus[],
    quoteRequested?: boolean,
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
    // Admin queue (row 68): errands with / without a pending quote request.
    if (quoteRequested === true) {
      qb.andWhere('e."quoteRequestedAt" IS NOT NULL');
    } else if (quoteRequested === false) {
      qb.andWhere('e."quoteRequestedAt" IS NULL');
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
    this.terminationHooks.push(async (manager, { to, ...change }) => {
      if (to === ErrandStatus.CANCELLED) {
        await hook(manager, change);
      }
    });
  }

  /**
   * Registers work that must commit atomically with every transition to a
   * terminal status a paid task can end in undelivered: CANCELLED, EXPIRED
   * (RUNNER_ASSIGNED -> EXPIRED) or FAILED (RUNNER_EN_ROUTE -> FAILED).
   * Used by the payments module to open refund reviews (rows 37, 102).
   */
  onTerminated(hook: TerminationHook): void {
    this.terminationHooks.push(hook);
  }

  /**
   * Registers work that must commit atomically with COMPLETED -> CONFIRMED
   * (the dispute window closed without a dispute). Used by the payments
   * module to record the runner's payout ledger lines (rows 104, 107)
   * without errands depending on payments.
   */
  onConfirmed(hook: ConfirmationHook): void {
    this.confirmationHooks.push(hook);
  }

  /**
   * Transitions an errand to a target status, validating against the strict
   * state machine and recording a history row (append-only). The errand row
   * is read under SELECT ... FOR UPDATE, so concurrent transitions on one
   * errand (a runner accept vs the offer-expiry sweep, an admin cancel vs an
   * accept) run one after the other: the later one re-reads the committed
   * status and gets 409 `illegal_transition` when it no longer applies.
   * `guard` must be passed by the one flow allowed to perform a guarded
   * transition.
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
    // Row lock first: every transition on this errand queues behind any
    // other in flight (reviewer B1, round 7). Re-locking a row the caller
    // already locked in the same transaction is a no-op.
    const errand = await manager.getRepository(Errand).findOne({
      where: { id: errandId },
      lock: { mode: 'pessimistic_write' },
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
    const accepting = fromStatus === ErrandStatus.RUNNER_ASSIGNED && to === ErrandStatus.RUNNER_EN_ROUTE;
    if (accepting && actor.type === StatusHistoryActor.RUNNER) {
      await this.refuseExpiredOffer(manager, errandId, actor, subject);
    }
    await this.enforceSubject(manager, errand, actor, subject);
    if (accepting) {
      const offer = await this.acceptOffer(manager, errandId);
      // Row 185: past the customer deadline the task cannot be accepted any
      // more, even before the sweep has expired it. Same code as a lapsed offer.
      if (deadlinePassed(errand)) {
        throw new ApiError(HttpStatus.CONFLICT, 'offer_expired', 'This task has passed its deadline and can no longer be accepted', {
          offerExpiresAt: offer?.offerExpiresAt?.toISOString() ?? null,
          reason: 'task_deadline_passed',
          deadlineAt: (errand.deadlineAt as Date).toISOString(),
        });
      }
      if (offer) {
        // RA-8, RA-20: verified, online, no other job; the runner becomes busy.
        await this.runners.startJob(offer.runnerProfileId, manager);
        for (const g of this.acceptGuards) {
          await g(manager, { errandId, runnerProfileId: offer.runnerProfileId });
        }
      }
    }
    // RA-20: the runner is free again once the job leaves the active states.
    if (RUNNER_ACTIVE_JOB_STATES.has(fromStatus) && !RUNNER_ACTIVE_JOB_STATES.has(to)) {
      const holder = await this.activeAssignmentFor(errandId, manager);
      if (holder) {
        await this.runners.endJob(holder.runnerProfileId, manager);
      }
    }
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

    if (REFUNDABLE_TERMINAL_STATUSES.includes(to)) {
      for (const hook of this.terminationHooks) {
        await hook(manager, { errandId, from: fromStatus, to, actor: actor.type, guard });
      }
    }

    // Reviewer B1 (row 183): a task leaving RUNNER_ASSIGNED for CANCELLED or
    // EXPIRED closes its open offer as `expired` (the runner never declined),
    // so no view or room keeps an unaccepted runner on an ended task. Runs
    // after the termination hooks so they still see the task as it was.
    if (fromStatus === ErrandStatus.RUNNER_ASSIGNED && (to === ErrandStatus.CANCELLED || to === ErrandStatus.EXPIRED)) {
      await manager
        .getRepository(ErrandAssignment)
        .update({ errandId, status: AssignmentStatus.ASSIGNED }, { status: AssignmentStatus.EXPIRED, decidedAt: new Date() });
    }

    if (to === ErrandStatus.CONFIRMED) {
      for (const hook of this.confirmationHooks) {
        await hook(manager, { errandId, from: fromStatus, actor: actor.type });
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

  /** Acceptance window of an admin-made offer in seconds (row 114: 10 minutes). */
  private adminOfferWindowSeconds(): number {
    return this.config?.get<number>('matching.adminOfferWindowSeconds', 600) ?? 600;
  }

  /**
   * Rows 141, 157: the runner's accept (RUNNER_ASSIGNED -> RUNNER_EN_ROUTE)
   * is refused once the current offer's deadline has passed, even before the
   * sweep has marked it `expired`. 409 `offer_expired` with `offerExpiresAt`.
   * Assignments without a deadline (made before row 141) never lapse.
   * Accepted in time, the assignment becomes `accepted` (decidedAt = now),
   * so its offerExpiresAt no longer reads as an open offer.
   */
  private async acceptOffer(manager: EntityManager, errandId: string, now = new Date()): Promise<ErrandAssignment | null> {
    const current = await this.activeAssignmentFor(errandId, manager);
    if (current?.offerExpiresAt && current.offerExpiresAt.getTime() <= now.getTime()) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'offer_expired',
        'This offer has expired and can no longer be accepted',
        { offerExpiresAt: current.offerExpiresAt.toISOString() },
      );
    }
    if (current?.status === AssignmentStatus.ASSIGNED) {
      await manager.getRepository(ErrandAssignment).update(current.id, {
        status: AssignmentStatus.ACCEPTED,
        decidedAt: now,
      });
    }
    return current;
  }

  /** Registers a check run inside every runner accept (see `AcceptGuard`). */
  onRunnerAccept(guard: AcceptGuard): void {
    this.acceptGuards.push(guard);
  }

  /** Registers a check run inside every admin assign (see `AssignGuard`). */
  onAssign(guard: AssignGuard): void {
    this.assignGuards.push(guard);
  }

  /**
   * Row 185 (owner, 2026-10-16): "RUNNER_ASSIGNED has two independent paths
   * to EXPIRED: (1) the customer deadlineAt is reached with no runner
   * accepted; (2) matching exhausted." This is path (1), run by the
   * `offer-expiry` maintenance job before the lapse sweep: RUNNER_ASSIGNED
   * -> EXPIRED (system) for every task whose `deadlineAt` has passed. The
   * transition runs the termination hooks (refund review for a paid task,
   * row 102), closes any open offer as `expired` and emits
   * `errand.status_changed` (the customer's EXPIRED notification). Each
   * errand is re-checked under its row lock; one failing never stops the
   * batch. PAYMENT_CONFIRMED tasks are not touched (row 201 open). Returns
   * the ids it expired.
   */
  async expirePastDeadline(
    now: Date = new Date(),
    limit = 100,
    /** Restrict to these errands (tests on a shared database). */
    onlyIds?: string[],
  ): Promise<string[]> {
    const qb = this.errands
      .createQueryBuilder('e')
      .select('e.id', 'id')
      .where('e.status = :assigned', { assigned: ErrandStatus.RUNNER_ASSIGNED })
      .andWhere('e."deadlineAt" IS NOT NULL AND e."deadlineAt" <= :now', { now });
    if (onlyIds) {
      qb.andWhere('e.id IN (:...onlyIds)', { onlyIds: onlyIds.length > 0 ? onlyIds : ['00000000-0000-0000-0000-000000000000'] });
    }
    const due = await qb.orderBy('e."deadlineAt"', 'ASC').limit(limit).getRawMany<{ id: string }>();
    const expired: string[] = [];
    for (const { id } of due) {
      try {
        const done = await this.inTx(async (manager): Promise<TaskDeadlineExpiredEvent | null> => {
          const errand = await manager
            .getRepository(Errand)
            .findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
          if (errand?.status !== ErrandStatus.RUNNER_ASSIGNED || !deadlinePassed(errand, now)) {
            return null; // Accepted, cancelled or re-dated meanwhile.
          }
          // Row 205 (open, proposal built): an offer still open at the deadline ends with the task.
          const open = await this.activeAssignmentFor(id, manager);
          await this.performTransition(manager, id, ErrandStatus.EXPIRED, { type: StatusHistoryActor.SYSTEM }, DEADLINE_EXPIRY_NOTE);
          return {
            errandId: id,
            reference: errand.reference,
            deadlineAt: (errand.deadlineAt as Date).toISOString(),
            closedOffer:
              open?.status === AssignmentStatus.ASSIGNED
                ? { assignmentId: open.id, runnerProfileId: open.runnerProfileId }
                : null,
          };
        });
        if (done) {
          expired.push(id);
          setImmediate(() => {
            // An offered runner loses access: the realtime gateway re-checks the room.
            // job:offer_withdrawn waits for the runner room (RA-5).
            this.events.emit('errand.access_changed', { errandId: id });
            this.events.emit(TASK_DEADLINE_EXPIRED_EVENT, done);
          });
        }
      } catch (err) {
        const code = err instanceof ApiError ? err.code : err instanceof Error ? err.constructor.name : String(err);
        this.logger.warn(`Deadline expiry skipped errand ${id}: ${code} (${err instanceof Error ? err.message : String(err)})`);
      }
    }
    return expired;
  }

  /**
   * Row 157 (owner, 2026-10-16, replaces the "EXPIRED at once" reading of
   * row 141): an admin offer that reaches its acceptance deadline unaccepted
   * expires, the assignment becomes `expired` (decidedAt = the sweep time)
   * and the runner loses access (`errand.access_changed`). The task stays
   * RUNNER_ASSIGNED with no open offer, exactly as after a decline (row 108),
   * so the admin can offer it to another runner (POST /errands/:id/assign).
   * No status change and no history row. RUNNER_ASSIGNED -> EXPIRED is left
   * to the process that decides no further runner can be assigned, which is
   * not defined yet (BOARD question). Run by the `offer-expiry` maintenance
   * job; each errand is re-checked under its row lock. Only an open offer
   * (`assigned`) lapses. Returns the ids whose offer it expired.
   */
  async expireLapsedOffers(now: Date = new Date(), limit = 100): Promise<string[]> {
    const due = await this.errands
      .createQueryBuilder('e')
      .select('e.id', 'id')
      .innerJoin(
        ErrandAssignment,
        'a',
        `a."errandId" = e.id AND a.id = (SELECT l.id FROM "errand_assignments" l
           WHERE l."errandId" = e.id ORDER BY l."createdAt" DESC, l.id DESC LIMIT 1)`,
      )
      .where('e.status = :assigned', { assigned: ErrandStatus.RUNNER_ASSIGNED })
      .andWhere('a.status = :open', { open: AssignmentStatus.ASSIGNED })
      .andWhere('a."offerExpiresAt" <= :now', { now })
      .orderBy('a."offerExpiresAt"', 'ASC')
      .limit(limit)
      .getRawMany<{ id: string }>();
    const expired: string[] = [];
    for (const { id } of due) {
      let done: AssignmentExpiredEvent | null;
      try {
        done = await this.inTx(async (manager): Promise<AssignmentExpiredEvent | null> => {
          const errand = await manager
            .getRepository(Errand)
            .findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
          if (errand?.status !== ErrandStatus.RUNNER_ASSIGNED) {
            return null; // Cancelled meanwhile.
          }
          const offer = await this.expireLapsedOfferIn(manager, id, now);
          return offer
            ? {
                errandId: id,
                reference: errand.reference,
                assignmentId: offer.id,
                runnerProfileId: offer.runnerProfileId,
                offerExpiresAt: (offer.offerExpiresAt as Date).toISOString(),
              }
            : null;
        });
      } catch (err) {
        // One errand failing never stops the batch (reviewer minor 1); the
        // next run re-checks it.
        const code = err instanceof ApiError ? err.code : err instanceof Error ? err.constructor.name : String(err);
        this.logger.warn(`Offer expiry skipped errand ${id}: ${code} (${err instanceof Error ? err.message : String(err)})`);
        continue;
      }
      if (done) {
        const event = done;
        expired.push(id);
        setImmediate(() => {
          // The runner loses access: the realtime gateway re-checks the room.
          this.events.emit('errand.access_changed', { errandId: id });
          // Admin feed item (N-20); the customer is not told: the task did not change.
          this.events.emit(ASSIGNMENT_EXPIRED_EVENT, event);
        });
      }
    }
    return expired;
  }

  /**
   * With the errand row already locked: marks the current offer `expired`
   * when it is still open (`assigned`) and its deadline has passed, and
   * returns it. Null when there is nothing to expire (accepted, declined,
   * reassigned, no deadline, or not yet due).
   */
  private async expireLapsedOfferIn(
    manager: EntityManager,
    errandId: string,
    now: Date,
  ): Promise<ErrandAssignment | null> {
    const offer = await this.activeAssignmentFor(errandId, manager);
    if (
      offer?.status !== AssignmentStatus.ASSIGNED ||
      !offer.offerExpiresAt ||
      offer.offerExpiresAt.getTime() > now.getTime()
    ) {
      return null;
    }
    await manager.getRepository(ErrandAssignment).update(offer.id, {
      status: AssignmentStatus.EXPIRED,
      decidedAt: now,
    });
    return offer;
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
        // The re-quote answers any pending "Request a new quote" (row 68).
        current.quoteRequestedAt = null;
        await manager
          .getRepository(Errand)
          .update(errandId, { quotedPrice: current.quotedPrice, quoteRequestedAt: null });
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
   * Customer "Request a new quote" (row 68). Allowed on the owner's QUOTED
   * or ACCEPTED errand whose newest quote has expired; records
   * `quoteRequestedAt` (no status change) and emits `quote.requested` after
   * commit so admins are notified (feed + socket). Errors:
   * - 409 `quote_request_not_allowed` in any other status or without a quote
   * - 409 `quote_still_valid` while the newest quote is still valid
   * - 409 `quote_request_pending` when a request is already waiting
   * The admin re-quote clears the request.
   */
  async requestNewQuote(errandId: string, viewer: ViewerContext): Promise<ErrandView> {
    await this.getById(errandId, viewer);
    const event = await this.inTx(async (manager) => {
      const errand = await manager.getRepository(Errand).findOne({
        where: { id: errandId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!errand) {
        throw new NotFoundException('Errand not found');
      }
      const latest = await this.currentQuote(errandId, manager);
      if (!REQUOTABLE.has(errand.status) || !latest) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'quote_request_not_allowed',
          `A new quote cannot be requested while the task is ${errand.status}`,
          { status: errand.status },
        );
      }
      if (errand.quoteRequestedAt) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'quote_request_pending',
          'A new quote has already been requested for this task',
          { quoteRequestedAt: errand.quoteRequestedAt.toISOString() },
        );
      }
      if (!latest.expiresAt || latest.expiresAt.getTime() > Date.now()) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'quote_still_valid',
          'The current quote is still valid; a new one can be requested once it expires',
          { quoteId: latest.id, expiresAt: latest.expiresAt?.toISOString() ?? null },
        );
      }
      const at = new Date();
      await manager.getRepository(Errand).update(errandId, { quoteRequestedAt: at });
      const out: QuoteRequestedEvent = {
        errandId,
        reference: errand.reference,
        quoteId: latest.id,
        status: errand.status,
        quoteRequestedAt: at.toISOString(),
      };
      return out;
    });
    setImmediate(() => this.events.emit(QUOTE_REQUESTED_EVENT, event));
    return this.getDetail(errandId, viewer);
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

  /**
   * Every quote expires (row 83): the admin's `expiresAt`, else now +
   * QUOTES_DEFAULT_TTL_HOURS (24). An expiry not in the future is refused
   * (400 `quote_expiry_in_past`); null is refused by the DTO.
   */
  quoteExpiryFor(expiresAt: string | undefined, now: Date = new Date()): Date {
    if (expiresAt === undefined) {
      const hours = this.config?.get<number>('quotes.defaultTtlHours', 24) ?? 24;
      return new Date(now.getTime() + hours * 3_600_000);
    }
    const at = new Date(expiresAt);
    if (Number.isNaN(at.getTime()) || at.getTime() <= now.getTime()) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'quote_expiry_in_past',
        'A quote expiry must be a date in the future',
        { expiresAt },
      );
    }
    return at;
  }

  private saveQuote(manager: EntityManager, errandId: string, quote: QuoteInput): Promise<Quote> {
    const expiresAt = this.quoteExpiryFor(quote.expiresAt);
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
        expiresAt,
      }),
    );
  }

  /**
   * v1 semi-automated matching: the admin's one-click assignment. Creates an
   * open offer for the runner (`assigned`, `offerExpiresAt` = now + the
   * admin offer window) and moves PAYMENT_CONFIRMED -> RUNNER_ASSIGNED in the
   * same transaction. On a RUNNER_ASSIGNED errand with no active assignment
   * (the runner declined, row 108, or the offer expired, row 157) it only
   * creates the new offer (`history: null`, no status change). An open offer
   * whose deadline has passed but which the sweep has not reached yet is
   * marked `expired` first, so the admin never waits for the sweep. A
   * runner who declined the task or let an offer for it lapse cannot be
   * offered it again: 409 `runner_already_offered` (`runnerProfileId`,
   * `previousStatus` declined | expired, `assignmentId`; row 178).
   */
  async assign(
    errandId: string,
    runnerProfileId: string,
    actor: ActorReference,
    note?: string,
  ): Promise<{ errand: Errand; history: ErrandStatusHistory | null; assignment: ErrandAssignment }> {
    let lapsed = false;
    const result = await this.inTx(async (manager) => {
      const runner = await manager
        .getRepository(RunnerProfile)
        .findOne({ where: { id: runnerProfileId } });
      if (!runner) {
        throw new NotFoundException('Runner profile not found');
      }
      const locked = await manager
        .getRepository(Errand)
        .findOne({ where: { id: errandId }, lock: { mode: 'pessimistic_write' } });
      // Row 185: past the customer deadline a RUNNER_ASSIGNED task is no
      // longer offered or reassigned. PAYMENT_CONFIRMED is held for row 201
      // (round-11 item 7): assigning it still works.
      if (locked?.status === ErrandStatus.RUNNER_ASSIGNED && deadlinePassed(locked)) {
        throw new ApiError(HttpStatus.CONFLICT, 'task_deadline_passed', 'This task has passed its deadline and can no longer be offered', {
          deadlineAt: (locked.deadlineAt as Date).toISOString(),
        });
      }
      if (locked?.status === ErrandStatus.RUNNER_ASSIGNED && (await this.expireLapsedOfferIn(manager, errandId, new Date()))) {
        lapsed = true; // The admin is acting on it already: no feed item.
      }
      // Reassignment after a decline (row 108) or an expired offer (row 157):
      // the errand stays RUNNER_ASSIGNED (no transition, §3.3) and gets a new
      // assignment.
      // Row 178 (owner, 2026-10-16): never re-offer a task to a runner who
      // declined it or let an offer for it lapse.
      const previous = await manager.getRepository(ErrandAssignment).findOne({
        where: { errandId, runnerProfileId, status: In([AssignmentStatus.DECLINED, AssignmentStatus.EXPIRED]) },
        order: { createdAt: 'DESC' },
      });
      if (previous) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'runner_already_offered',
          previous.status === AssignmentStatus.DECLINED
            ? 'This runner declined this task. Choose another runner.'
            : "This runner's offer for this task lapsed. Choose another runner.",
          { runnerProfileId, previousStatus: previous.status, assignmentId: previous.id },
        );
      }
      for (const g of this.assignGuards) {
        await g(manager, { errandId, runnerProfileId });
      }
      const reassign =
        locked?.status === ErrandStatus.RUNNER_ASSIGNED &&
        (await manager.getRepository(ErrandAssignment).count({
          where: { errandId, status: In(ACTIVE_ASSIGNMENT_STATUSES) },
        })) === 0;
      const done: { errand: Errand; history: ErrandStatusHistory | null } = reassign
        ? { errand: locked, history: null }
        : await this.performTransition(manager, errandId, ErrandStatus.RUNNER_ASSIGNED, actor, note);
      const assignmentRepo = manager.getRepository(ErrandAssignment);
      const assignment = await assignmentRepo.save(
        assignmentRepo.create({
          errandId,
          runnerProfileId,
          status: AssignmentStatus.ASSIGNED,
          decidedAt: new Date(),
          offerExpiresAt: new Date(Date.now() + this.adminOfferWindowSeconds() * 1000),
        }),
      );
      return { errand: done.errand, history: done.history, assignment };
    });
    if (lapsed) {
      // The previous runner loses access: the realtime gateway re-checks the room.
      setImmediate(() => this.events.emit('errand.access_changed', { errandId }));
    }
    return result;
  }

  /**
   * The offered runner declines (rows 108, 113, 137). Only while the errand
   * is RUNNER_ASSIGNED and the offer is open: the assignment becomes
   * `declined` (with the reason, if any), the errand keeps its status (§3.3,
   * no new state) and waits for an admin to offer it to another runner; the
   * runner is never offered this task again (row 178). A decline never
   * starts or changes an expiry deadline (row 155) and never expires the
   * task (row 167). No runner metric reads declines. `guard` runs in the
   * transaction with the errand locked.
   * Errors: 409 `assignment_not_declinable` (`status`); 409 `offer_expired`
   * (`offerExpiresAt`) once the offer's deadline has passed; 403 not the
   * offered runner.
   */
  async declineAssignment(
    errandId: string,
    runnerUserId: string,
    reason: AssignmentDeclineReason | null,
    guard?: DeclineGuard,
    now: Date = new Date(),
  ): Promise<ErrandAssignment> {
    let event: AssignmentDeclinedEvent | null = null;
    const saved = await this.inTx(async (manager) => {
      const errand = await manager
        .getRepository(Errand)
        .findOne({ where: { id: errandId }, lock: { mode: 'pessimistic_write' } });
      if (!errand) {
        throw new NotFoundException('Errand not found');
      }
      const runner = await manager.getRepository(RunnerProfile).findOne({ where: { userId: runnerUserId } });
      const assignmentRepo = manager.getRepository(ErrandAssignment);
      const current = await assignmentRepo.findOne({
        where: { errandId, status: In(ACTIVE_ASSIGNMENT_STATUSES) },
        order: { createdAt: 'DESC' },
      });
      if (!runner || !current || current.runnerProfileId !== runner.id) {
        // The sweep may already have closed this runner's offer (row 157).
        await this.refuseExpiredOffer(manager, errandId, { type: StatusHistoryActor.RUNNER, id: runner?.id ?? null });
        throw new ForbiddenException('You are not assigned to this errand');
      }
      if (errand.status !== ErrandStatus.RUNNER_ASSIGNED) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'assignment_not_declinable',
          `An assignment can only be declined before you set off (task is ${errand.status})`,
          { status: errand.status },
        );
      }
      if (current.offerExpiresAt && current.offerExpiresAt.getTime() <= now.getTime()) {
        throw new ApiError(HttpStatus.CONFLICT, 'offer_expired', 'This offer has expired', {
          offerExpiresAt: current.offerExpiresAt.toISOString(),
        });
      }
      await guard?.(manager, { errandId, runnerProfileId: runner.id, reason });
      current.status = AssignmentStatus.DECLINED;
      current.decidedAt = now;
      current.declineReason = reason;
      const out = await assignmentRepo.save(current);
      event = {
        errandId,
        reference: errand.reference,
        assignmentId: out.id,
        runnerProfileId: runner.id,
        reason,
      };
      return out;
    });
    const declined = event;
    setImmediate(() => {
      // The runner loses access: the realtime gateway re-checks the room.
      this.events.emit('errand.access_changed', { errandId });
      if (declined) {
        this.events.emit(ASSIGNMENT_DECLINED_EVENT, declined);
      }
    });
    return saved;
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
  /**
   * Row 157: once the sweep has marked a runner's offer `expired` the runner
   * holds no assignment, so the accept would read 403. A runner whose newest
   * assignment on the errand is an expired offer gets the same 409
   * `offer_expired` (`offerExpiresAt`) as before the sweep ran.
   */
  private async refuseExpiredOffer(
    manager: EntityManager,
    errandId: string,
    actor: ActorReference,
    subject?: ViewerContext,
  ): Promise<void> {
    const runnerProfile = subject
      ? await manager.getRepository(RunnerProfile).findOne({ where: { userId: subject.userId } })
      : null;
    const runnerProfileId = runnerProfile?.id ?? actor.id ?? null;
    if (!runnerProfileId) {
      return;
    }
    const latest = await this.latestAssignmentOf(errandId, runnerProfileId, manager);
    if (latest?.status === AssignmentStatus.EXPIRED && latest.offerExpiresAt) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'offer_expired',
        'This offer has expired and can no longer be accepted',
        { offerExpiresAt: latest.offerExpiresAt.toISOString() },
      );
    }
  }

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

/**
 * RA-2: a runner never reads the customer's price: no quoted or final price
 * (the fee basis), no fee total, no quote expiry. The runner fee and item
 * amount come from `GET /runners/me/jobs/:errandId`.
 */
export const withoutCustomerPricing = <T extends Partial<ErrandView>>(view: T): T =>
  Object.assign(view, {
    quotedPrice: null,
    finalPrice: null,
    feeTotal: null,
    quoteExpiresAt: null,
    quoteAcceptanceRequired: false,
  });

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

/** Assignment as returned on errand views (current one, or the admin history). */
const toAssignmentView = (a: ErrandAssignment, runner: RunnerPublicSummary | null): ErrandAssignmentView => ({
  id: a.id,
  status: a.status,
  assignedAt: a.decidedAt ?? a.createdAt,
  offerExpiresAt: a.offerExpiresAt ?? null,
  offeredAt: a.createdAt,
  decidedAt: a.status === AssignmentStatus.ASSIGNED ? null : (a.decidedAt ?? null),
  declineReason: a.declineReason ?? null,
  runner,
});
