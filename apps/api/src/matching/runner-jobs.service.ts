import { ForbiddenException, HttpStatus, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiError } from '../common/api-error';
import { AssignmentDeclineReason, AssignmentStatus, ErrandCategory, ErrandStatus, ErrandUrgency, StatusHistoryActor } from '../common/enums';
import { ErrandAssignment } from '../errands/errand-assignment.entity';
import { BUDGET_CATEGORIES } from '../errands/errand-rules';
import { Errand } from '../errands/errand.entity';
import { ErrandStatusHistory } from '../errands/errand-status-history.entity';
import {
  ErrandItemView,
  ErrandLocationView,
  ErrandsService,
  ViewerContext,
} from '../errands/errands.service';
import { MerchantRoute } from '../payments/payment-views';
import { PaymentsService } from '../payments/payments.service';
import { RunnerPayoutsService } from '../payments/runner-payouts.service';
import { RunnersService } from '../runners/runners.service';
import { PurchaseLimitService } from './purchase-limit.service';

/** The runner's own assignment on the job (RA-1). */
export interface RunnerJobAssignment {
  id: string;
  /** `assigned` = open offer, `accepted` once the runner accepted. */
  status: AssignmentStatus;
  offeredAt: Date;
  /** Acceptance deadline; null on offers made before row 141 (row 156: never lapse). */
  offerExpiresAt: Date | null;
  decidedAt: Date | null;
}

/**
 * RA-2: the runner's projection of a job (offer or held job). Three-flow
 * separation: the runner reads only their runner fee and the item amount.
 * Never the service fee, the customer's fee total or quoted price, or any
 * customer contact.
 */
export interface RunnerJobView {
  id: string;
  reference: string;
  status: ErrandStatus;
  category: ErrandCategory;
  title: string | null;
  description: string;
  urgency: ErrandUrgency;
  deadlineAt: Date | null;
  createdAt: Date;
  locations: ErrandLocationView[];
  /** First task point for the offer card: task site, else pickup, else drop-off. */
  firstPoint: ErrandLocationView | null;
  items: ErrandItemView[];
  runnerNotes: string | null;
  /** The runner fee the customer paid (KES, 2-decimal string). */
  runnerFee: string;
  /** Current item/merchant amount after approved price changes; null without one. */
  itemAmount: string | null;
  /** How the item is paid; null without an item amount. */
  merchantRoute: MerchantRoute | null;
  /** What the runner pays out of pocket and is reimbursed (send_to_runner), "0.00" otherwise. */
  requiredPurchase: string;
  /** The runner's purchase limit (row 138), KES. */
  maxPurchaseAdvance: string;
  /** requiredPurchase > maxPurchaseAdvance: accept is refused, an over-limit decline is allowed (rows 108, 113). */
  overPurchaseLimit: boolean;
  /** Shortcut for `assignment.offerExpiresAt` while the offer is open, else null. */
  offerExpiresAt: Date | null;
  assignment: RunnerJobAssignment;
}

/**
 * A2: 403 `job_not_held` = this runner does not hold the job (never
 * offered, declined, offer lapsed or withdrawn, reassigned). A job the
 * runner accepted stays readable after it ends (the accepted assignment
 * stays current), so the app maps this code to "access revoked".
 */
const jobNotHeld = (): ApiError =>
  new ApiError(HttpStatus.FORBIDDEN, 'job_not_held', 'This job is not assigned to you');

const FIRST_POINT_ORDER = ['task_site', 'pickup', 'dropoff'];

const firstPointOf = (locations: ErrandLocationView[]): ErrandLocationView | null =>
  [...locations].sort(
    (a, b) => FIRST_POINT_ORDER.indexOf(String(a.pointType)) - FIRST_POINT_ORDER.indexOf(String(b.pointType)),
  )[0] ?? null;

/**
 * RA-1, RA-2: runner offers, the runner job projection, accept and decline.
 * Accept is the RUNNER_ASSIGNED -> RUNNER_EN_ROUTE transition (row 113),
 * the same one `PATCH /errands/:id/status` performs; every check (offer
 * deadline, task deadline, verification, availability, purchase limit)
 * runs inside that transition, so both routes behave the same.
 */
@Injectable()
export class RunnerJobsService {
  constructor(
    private readonly errands: ErrandsService,
    private readonly runners: RunnersService,
    private readonly ledger: RunnerPayoutsService,
    private readonly payments: PaymentsService,
    private readonly purchaseLimits: PurchaseLimitService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  /**
   * `GET /runners/me/offers`: open offers, newest first. 403
   * runner_not_verified (RA-8). Returned whatever the runner's availability;
   * the app hides them while offline.
   */
  async offers(userId: string, opts: { limit?: number; cursor?: string | null } = {}): Promise<{
    items: RunnerJobView[];
    nextCursor: string | null;
  }> {
    const profile = await this.runners.profileByUserId(userId);
    await this.runners.assertVerified(profile.id);
    const page = await this.errands.openOffersFor(profile.id, opts);
    const extra = await this.errands.locationsAndItemsFor(page.items.map((i) => i.errand.id));
    const items: RunnerJobView[] = [];
    for (const { errand, assignment } of page.items) {
      items.push(
        await this.project(
          errand,
          assignment,
          extra.locations.get(errand.id) ?? [],
          extra.items.get(errand.id) ?? [],
          profile.id,
        ),
      );
    }
    return { items, nextCursor: page.nextCursor };
  }

  /**
   * `GET /runners/me/jobs` (A1): the jobs this runner accepted that are in
   * the active set, or finished within `errands.receiptWindowHours` (24 h,
   * row 129), as `RunnerJobView`s, newest accept first. Never open offers
   * (those are `GET /runners/me/offers`).
   */
  async heldJobs(
    userId: string,
    opts: { limit?: number; cursor?: string | null } = {},
    now: Date = new Date(),
  ): Promise<{ items: RunnerJobView[]; nextCursor: string | null }> {
    const profile = await this.runners.profileByUserId(userId);
    const hours = this.config?.get<number>('errands.receiptWindowHours', 24) ?? 24;
    const page = await this.errands.heldJobsFor(profile.id, {
      since: new Date(now.getTime() - hours * 3_600_000),
      limit: opts.limit,
      cursor: opts.cursor ?? null,
    });
    const extra = await this.errands.locationsAndItemsFor(page.items.map((i) => i.errand.id));
    const items: RunnerJobView[] = [];
    for (const { errand, assignment } of page.items) {
      items.push(
        await this.project(errand, assignment, extra.locations.get(errand.id) ?? [], extra.items.get(errand.id) ?? [], profile.id),
      );
    }
    return { items, nextCursor: page.nextCursor };
  }

  /**
   * `GET /runners/me/jobs/:errandId`: the job as the runner sees it, while
   * the runner holds the current assignment (open offer or accepted). 403
   * otherwise (including after a decline or lapse).
   */
  async job(userId: string, errandId: string): Promise<RunnerJobView> {
    const viewer: ViewerContext = { role: 'runner', userId };
    let errand: Errand;
    try {
      errand = await this.errands.getById(errandId, viewer);
    } catch (err) {
      throw err instanceof ForbiddenException ? jobNotHeld() : err;
    }
    const profile = await this.runners.profileByUserId(userId);
    const assignment = await this.errands.activeAssignmentFor(errandId);
    if (assignment?.runnerProfileId !== profile.id) {
      throw jobNotHeld();
    }
    const extra = await this.errands.locationsAndItemsFor([errandId]);
    return this.project(errand, assignment, extra.locations.get(errandId) ?? [], extra.items.get(errandId) ?? [], profile.id);
  }

  /**
   * `POST /errands/:id/accept` (system design §3.2): RUNNER_ASSIGNED ->
   * RUNNER_EN_ROUTE, assignment `accepted`, runner `busy`. Returns the
   * runner projection and the history row.
   */
  async accept(userId: string, errandId: string): Promise<{ job: RunnerJobView; history: ErrandStatusHistory }> {
    const { history } = await this.errands.transition(
      errandId,
      ErrandStatus.RUNNER_EN_ROUTE,
      { type: StatusHistoryActor.RUNNER, id: userId },
      undefined,
      { role: 'runner', userId },
    );
    return { job: await this.job(userId, errandId), history };
  }

  /** `POST /errands/:id/decline` `{ reason? }` (rows 113, 134). */
  async decline(userId: string, errandId: string, reason: AssignmentDeclineReason | null) {
    return this.purchaseLimits.decline(errandId, userId, reason);
  }

  private async project(
    errand: Errand,
    assignment: ErrandAssignment,
    locations: ErrandLocationView[],
    items: ErrandItemView[],
    runnerProfileId: string,
  ): Promise<RunnerJobView> {
    const [runnerFee, route, check] = await Promise.all([
      this.ledger.runnerFeePaid(errand.id),
      this.payments.primaryRouteFor(errand.id),
      this.purchaseLimits.checkIn(undefined, errand.id, runnerProfileId),
    ]);
    const budget = Number(errand.budget ?? 0);
    const hasItem = BUDGET_CATEGORIES.has(errand.category) && budget > 0;
    const open = assignment.status === AssignmentStatus.ASSIGNED && errand.status === ErrandStatus.RUNNER_ASSIGNED;
    return {
      id: errand.id,
      reference: errand.reference,
      status: errand.status,
      category: errand.category,
      title: errand.title ?? null,
      description: errand.description,
      urgency: errand.urgency,
      deadlineAt: errand.deadlineAt ?? null,
      createdAt: errand.createdAt,
      locations,
      firstPoint: firstPointOf(locations),
      items,
      runnerNotes: errand.runnerNotes ?? null,
      runnerFee: runnerFee.toFixed(2),
      itemAmount: hasItem ? budget.toFixed(2) : null,
      merchantRoute: hasItem ? route : null,
      requiredPurchase: check.requiredPurchase,
      maxPurchaseAdvance: check.maxPurchaseAdvance,
      overPurchaseLimit: check.overLimit,
      offerExpiresAt: open ? (assignment.offerExpiresAt ?? null) : null,
      assignment: {
        id: assignment.id,
        status: assignment.status,
        offeredAt: assignment.createdAt,
        offerExpiresAt: assignment.offerExpiresAt ?? null,
        decidedAt: assignment.status === AssignmentStatus.ASSIGNED ? null : (assignment.decidedAt ?? null),
      },
    };
  }
}
