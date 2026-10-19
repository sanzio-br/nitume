import { HttpStatus, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ApiError } from '../common/api-error';
import { AssignmentStatus, ErrandStatus, RunnerAvailability, RunnerSkill } from '../common/enums';
import { ErrandAssignment } from '../errands/errand-assignment.entity';
import { ErrandsService } from '../errands/errands.service';
import { RunnerPayoutsService } from '../payments/runner-payouts.service';
import { distanceKm } from '../runners/service-areas';
import { RunnersService, PoolRunner } from '../runners/runners.service';

/** Why a runner in the pool cannot take this task (row 186); null when they can. */
export type CandidateIneligibleReason = 'over_purchase_limit';

/** One runner in `GET /errands/:id/candidates` (N-20). */
export interface CandidateView {
  runnerProfileId: string;
  displayName: string | null;
  /** runner_profiles.avg_rating, 2-decimal string. */
  rating: string;
  tasksCompleted: number;
  /** `online` or `offline`; busy runners are not listed (row 187 (c)). */
  availability: RunnerAvailability.ONLINE | RunnerAvailability.OFFLINE;
  /** Row 215: offline but otherwise eligible. Assignable by an admin; never counted in `eligibleRemaining`. */
  offline: boolean;
  /** Row 178: this runner declined the task or let an offer for it lapse; cannot be offered it again. */
  tried: AssignmentStatus.DECLINED | AssignmentStatus.EXPIRED | null;
  ineligibleReason: CandidateIneligibleReason | null;
  /** Straight-line km from the runner's last ping to the task's first point; null without either. */
  distanceKm: number | null;
  /** runner_profiles.max_purchase_advance, 2-decimal string (row 186). */
  purchaseLimit: string;
}

export interface CandidatesPage {
  items: CandidateView[];
  nextCursor: string | null;
  /**
   * Rows 177, 178, 186, 204: pool runners who are online, not busy, within
   * their purchase limit and never declined or let an offer for this task
   * lapse. Offline and busy runners never count.
   */
  eligibleRemaining: number;
  /** Row 215: offline runners who would otherwise be eligible (`Show offline runners ({n})`). */
  offlineCount: number;
  /** Runners who declined or let an offer for this task lapse (any runner, listed or not). */
  triedCount: number;
  /** The task's required out-of-pocket purchase (row 186), 2-decimal string. */
  requiredPurchase: string;
}

/**
 * Rows 167, 177, 178, 204, 227 (owner, 2026-10-19): matching is exhausted
 * when the task has had at least one offer ("a task never offered to anyone
 * is not exhausted; exhaustion needs at least one offer made"), has no open
 * offer, and no eligible online runner is left (offline and busy runners do
 * not count). Not wired to any transition yet: row 179 holds back automatic
 * exhaustion until the full pool exists.
 */
export const matchingExhausted = (input: { offersMade: number; openOffer: boolean; eligibleRemaining: number }): boolean =>
  input.offersMade > 0 && !input.openOffer && input.eligibleRemaining === 0;

/** States the candidates read answers for: before the first offer, and while re-offering. */
const CANDIDATE_STATUSES: ReadonlySet<ErrandStatus> = new Set([
  ErrandStatus.PAYMENT_CONFIRMED,
  ErrandStatus.RUNNER_ASSIGNED,
]);

const FIRST_POINT_ORDER = ['task_site', 'pickup', 'dropoff'];

/** Sort key: online, untried, within the limit first; then nearest, best rated, id. */
type SortKey = [number, number, number, number, number, string];

const keyOf = (c: CandidateView): SortKey => [
  c.offline ? 1 : 0,
  c.tried ? 1 : 0,
  c.ineligibleReason ? 1 : 0,
  c.distanceKm ?? 1e9,
  -Number(c.rating),
  c.runnerProfileId,
];

const compareKeys = (a: SortKey, b: SortKey): number => {
  for (let i = 0; i < 5; i += 1) {
    const d = (a[i] as number) - (b[i] as number);
    if (d !== 0) {
      return d;
    }
  }
  return a[5] < b[5] ? -1 : a[5] > b[5] ? 1 : 0;
};

const encodeCursor = (key: SortKey): string => Buffer.from(JSON.stringify(key)).toString('base64url');

const decodeCursor = (cursor: string | null | undefined): SortKey | null => {
  if (!cursor) {
    return null;
  }
  try {
    const key: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      Array.isArray(key) &&
      key.length === 6 &&
      key.slice(0, 5).every((v) => typeof v === 'number' && Number.isFinite(v)) &&
      typeof key[5] === 'string'
    ) {
      return key as SortKey;
    }
  } catch {
    // Fall through.
  }
  throw new ApiError(HttpStatus.BAD_REQUEST, 'cursor_invalid', 'Unknown cursor');
};

/**
 * N-20, rows 177, 178, 186, 187 (c), 204, 215: the runners an admin may
 * offer a task to, and how many eligible online runners are left. A read:
 * it never moves the task (no exhaustion on a GET).
 */
@Injectable()
export class CandidatesService implements OnModuleInit {
  constructor(
    private readonly errands: ErrandsService,
    private readonly runners: RunnersService,
    private readonly ledger: RunnerPayoutsService,
  ) {}

  /** The admin expire rule (row 202) reads `eligibleRemaining` through the errands hook. */
  onModuleInit(): void {
    this.errands.onEligibleRemaining(async (manager, errandId) => (await this.compute(errandId, manager)).eligibleRemaining);
  }

  /**
   * `GET /errands/:id/candidates` (admin). 404 unknown task; 409
   * `task_not_assignable` (`status`) unless PAYMENT_CONFIRMED or
   * RUNNER_ASSIGNED; 400 `cursor_invalid`.
   */
  async list(errandId: string, opts: { limit?: number; cursor?: string | null } = {}): Promise<CandidatesPage> {
    const after = decodeCursor(opts.cursor);
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
    const all = await this.compute(errandId);
    const rest = after ? all.items.filter((c) => compareKeys(keyOf(c), after) > 0) : all.items;
    const items = rest.slice(0, limit);
    const last = items.at(-1);
    return {
      ...all,
      items,
      nextCursor: rest.length > limit && last ? encodeCursor(keyOf(last)) : null,
    };
  }

  /**
   * The whole sorted list and its counts. With `manager`, assignments and
   * the purchase are read inside the caller's transaction.
   *
   * Exhaustion is decided by `matchingExhausted` (rows 204, 227). Nothing
   * moves a task to EXPIRED on this count today: row 179 holds back
   * automatic exhaustion.
   */
  async compute(errandId: string, manager?: EntityManager): Promise<Omit<CandidatesPage, 'nextCursor'>> {
    const [errand] = await this.errands.findByIds([errandId]);
    if (!errand) {
      throw new NotFoundException('Errand not found');
    }
    if (!CANDIDATE_STATUSES.has(errand.status)) {
      throw new ApiError(HttpStatus.CONFLICT, 'task_not_assignable', 'This task is not waiting for a runner', {
        status: errand.status,
      });
    }
    const locations = await this.errands.locationsFor(errandId);
    const first = [...locations].sort(
      (a, b) => FIRST_POINT_ORDER.indexOf(String(a.pointType)) - FIRST_POINT_ORDER.indexOf(String(b.pointType)),
    )[0];
    const point = first ? { lat: first.coordinates.coordinates[1], lng: first.coordinates.coordinates[0] } : null;
    // One after the other: inside a transaction they share one connection.
    const pool = await this.runners.poolFor(errand.category as unknown as RunnerSkill, point, manager);
    const assignments = await this.errands.assignmentsOf(errandId, manager);
    const required = await this.ledger.itemPaidToNitume(errandId, manager);
    const tried = triedByRunner(assignments);
    const holders = new Set(
      assignments
        .filter((a) => a.status === AssignmentStatus.ASSIGNED || a.status === AssignmentStatus.ACCEPTED)
        .map((a) => a.runnerProfileId),
    );
    const items = pool
      .filter((r) => r.profile.availability !== RunnerAvailability.BUSY && !holders.has(r.profile.id))
      .map((r) => toCandidate(r, tried.get(r.profile.id) ?? null, required, point))
      .sort((a, b) => compareKeys(keyOf(a), keyOf(b)));
    const open = items.filter((c) => !c.tried && !c.ineligibleReason);
    return {
      items,
      eligibleRemaining: open.filter((c) => !c.offline).length,
      offlineCount: open.filter((c) => c.offline).length,
      triedCount: tried.size,
      requiredPurchase: required.toFixed(2),
    };
  }
}

/** Newest declined/expired assignment status per runner (row 178). */
const triedByRunner = (
  assignments: ErrandAssignment[],
): Map<string, AssignmentStatus.DECLINED | AssignmentStatus.EXPIRED> => {
  const out = new Map<string, AssignmentStatus.DECLINED | AssignmentStatus.EXPIRED>();
  for (const a of assignments) {
    if ((a.status === AssignmentStatus.DECLINED || a.status === AssignmentStatus.EXPIRED) && !out.has(a.runnerProfileId)) {
      out.set(a.runnerProfileId, a.status);
    }
  }
  return out;
};

const toCandidate = (
  r: PoolRunner,
  tried: AssignmentStatus.DECLINED | AssignmentStatus.EXPIRED | null,
  required: number,
  point: { lat: number; lng: number } | null,
): CandidateView => {
  const p = r.profile;
  const offline = p.availability !== RunnerAvailability.ONLINE;
  const at = p.currentLocation ? { lat: p.currentLocation.coordinates[1], lng: p.currentLocation.coordinates[0] } : null;
  return {
    runnerProfileId: p.id,
    displayName: r.displayName,
    rating: Number(p.avgRating).toFixed(2),
    tasksCompleted: p.errandsCompleted,
    availability: offline ? RunnerAvailability.OFFLINE : RunnerAvailability.ONLINE,
    offline,
    tried,
    ineligibleReason: required > Number(p.maxPurchaseAdvance) ? 'over_purchase_limit' : null,
    distanceKm: at && point ? Math.round(distanceKm(at, point) * 100) / 100 : null,
    purchaseLimit: Number(p.maxPurchaseAdvance).toFixed(2),
  };
};
