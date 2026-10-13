import {
  ForbiddenException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { ApiError } from '../common/api-error';
import {
  ErrandCategory,
  ErrandStatus,
  EvidenceType,
  PaymentTransactionStatus,
  PaymentTypeCode,
} from '../common/enums';
import { ErrandsService } from '../errands/errands.service';
import { EvidenceService } from '../evidence/evidence.service';
import { RunnersService } from '../runners/runners.service';
import { shortNameOf } from '../runners/short-name';
import { UsersService } from '../users/users.service';
import { PaymentTransaction } from './payment-transaction.entity';
import { PaymentType } from './payment-type.entity';
import { Payment } from './payment.entity';
import {
  lockPayoutReference,
  normalizeReference,
  referenceUses,
  runnerReferenceConflict,
} from './payout-references';
import { RefundTrigger } from './refund-review.entity';
import { RefundsService } from './refunds.service';
import {
  OBLIGATION_LINE_TYPES,
  RunnerPayoutLine,
  RunnerPayoutLineStatus,
  RunnerPayoutLineType,
  RunnerPayoutReviewReason,
} from './runner-payout-line.entity';

const S = RunnerPayoutLineStatus;
const T = RunnerPayoutLineType;

/** Obligation line types (what a runner is owed). */
export type ObligationType = RunnerPayoutLineType.RUNNER_FEE | RunnerPayoutLineType.ITEM_REIMBURSEMENT;

/** Adjustment kinds an admin can record on a paid obligation. */
export type AdjustmentKind =
  | RunnerPayoutLineType.CORRECTION
  | RunnerPayoutLineType.REVERSAL
  | RunnerPayoutLineType.RESEND;

/**
 * Status of an obligation as clients see it: the stored status, except that
 * a `paid` line whose payout was reversed (and not re-sent) is `payable`
 * again (owed), like refunds (row 100).
 */
export type EffectiveLineStatus =
  | RunnerPayoutLineStatus.PENDING_REVIEW
  | RunnerPayoutLineStatus.PAYABLE
  | RunnerPayoutLineStatus.PAID
  | RunnerPayoutLineStatus.REJECTED;

/** Payout of a paid obligation after its adjustments, in order. */
export interface EffectiveRunnerPayout {
  state: 'sent' | 'reversed';
  amount: string;
  reference: string | null;
  at: Date | null;
}

type AdjustmentStep = Pick<RunnerPayoutLine, 'lineType' | 'payoutReference' | 'amount' | 'createdAt'>;

const money = (v: string | number | null | undefined): string => Number(v ?? 0).toFixed(2);

/** Pure: effective payout of an obligation; null unless `paid`. */
export const effectiveRunnerPayoutOf = (
  line: Pick<RunnerPayoutLine, 'status' | 'amount' | 'payoutReference' | 'paidAt'>,
  adjustments: AdjustmentStep[] = [],
): EffectiveRunnerPayout | null => {
  if (line.status !== S.PAID) {
    return null;
  }
  const out: EffectiveRunnerPayout = {
    state: 'sent',
    amount: money(line.amount),
    reference: line.payoutReference,
    at: line.paidAt,
  };
  for (const a of adjustments) {
    switch (a.lineType) {
      case T.CORRECTION:
        out.reference = a.payoutReference ?? out.reference;
        out.amount = a.amount !== null ? money(a.amount) : out.amount;
        break;
      case T.REVERSAL:
        out.state = 'reversed';
        out.amount = '0.00';
        out.reference = null;
        out.at = a.createdAt;
        break;
      case T.RESEND:
        out.state = 'sent';
        out.amount = money(a.amount ?? line.amount);
        out.reference = a.payoutReference;
        out.at = a.createdAt;
        break;
      default:
        break;
    }
  }
  return out;
};

/** Pure: client-facing status of an obligation (see `EffectiveLineStatus`). */
export const effectiveStatusOf = (
  line: Pick<RunnerPayoutLine, 'status'>,
  payout: EffectiveRunnerPayout | null,
): EffectiveLineStatus => {
  if (line.status === S.PAID) {
    return payout?.state === 'reversed' ? S.PAYABLE : S.PAID;
  }
  return line.status as EffectiveLineStatus;
};

/** Where one obligation stands in the runner's derived balance. */
export interface LinePosition {
  status: EffectiveLineStatus;
  /** Awaiting ops review (requested amount, not guaranteed). */
  pendingReview: number;
  /** Owed and not paid out (payable, or paid then reversed). */
  payable: number;
  /** Effective amount sent. */
  paid: number;
  payout: EffectiveRunnerPayout | null;
}

/** Pure: position of one obligation from its row and adjustments. */
export const linePositionOf = (
  line: Pick<RunnerPayoutLine, 'status' | 'amount' | 'requestedAmount' | 'payoutReference' | 'paidAt'>,
  adjustments: AdjustmentStep[] = [],
): LinePosition => {
  const payout = effectiveRunnerPayoutOf(line, adjustments);
  const status = effectiveStatusOf(line, payout);
  return {
    status,
    payout,
    pendingReview: status === S.PENDING_REVIEW ? Number(line.requestedAmount ?? 0) : 0,
    payable: status === S.PAYABLE ? Number(line.amount ?? 0) : 0,
    paid: payout?.state === 'sent' ? Number(payout.amount) : 0,
  };
};

export type EarningsGroupBy = 'day' | 'week' | 'month';

export interface BalanceTotals {
  pendingReview: string;
  payable: string;
  paid: string;
}

export interface EarningsBucket {
  /** First day of the bucket, YYYY-MM-DD in East Africa Time. */
  start: string;
  /** Runner fees earned (lines approved/payable/paid, created in the bucket). */
  runnerFee: string;
  /** Item reimbursements (not income: money the runner spent on the purchase). */
  itemReimbursement: string;
  /** Effective payouts sent in the bucket. */
  paidOut: string;
}

/**
 * Runner earnings, derived from the ledger lines (no stored balance, row 107).
 * `balance.payable` is the Runner app's "available balance" (system design
 * §6: amounts due minus amounts paid out).
 */
export interface EarningsSummary {
  currency: 'KES';
  balance: BalanceTotals;
  byType: { runnerFee: BalanceTotals; itemReimbursement: BalanceTotals };
  period: {
    from: string;
    to: string;
    groupBy: EarningsGroupBy;
    timeZone: 'Africa/Nairobi';
    totals: Omit<EarningsBucket, 'start'>;
    buckets: EarningsBucket[];
  };
}

/** East Africa Time is UTC+3 all year (no daylight saving). */
const EAT_OFFSET_MS = 3 * 3_600_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
export const MAX_EARNINGS_RANGE_DAYS = 366;

/** YYYY-MM-DD of an instant in East Africa Time. */
export const eatDate = (at: Date): string => new Date(at.getTime() + EAT_OFFSET_MS).toISOString().slice(0, 10);

const bucketStart = (day: string, groupBy: EarningsGroupBy): string => {
  if (groupBy === 'month') {
    return `${day.slice(0, 7)}-01`;
  }
  if (groupBy === 'week') {
    const d = new Date(`${day}T00:00:00Z`);
    const monday = (d.getUTCDay() + 6) % 7;
    return new Date(d.getTime() - monday * DAY_MS).toISOString().slice(0, 10);
  }
  return day;
};

/**
 * Validates and defaults an earnings range: the last 7 days (EAT, today
 * included) by day. 400 `earnings_range_invalid` on a bad date, from > to,
 * or more than 366 days.
 */
export const earningsRangeOf = (
  query: { from?: string; to?: string; groupBy?: EarningsGroupBy },
  now: Date = new Date(),
): { from: string; to: string; groupBy: EarningsGroupBy } => {
  const to = query.to ?? eatDate(now);
  const from = query.from ?? new Date(Date.parse(`${to}T00:00:00Z`) - 6 * DAY_MS).toISOString().slice(0, 10);
  const valid = (d: string) => DATE.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
  const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS;
  if (!valid(from) || !valid(to) || span < 0 || span >= MAX_EARNINGS_RANGE_DAYS) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      'earnings_range_invalid',
      `Give from/to as YYYY-MM-DD, from on or before to, at most ${MAX_EARNINGS_RANGE_DAYS} days`,
      { from, to },
    );
  }
  return { from, to, groupBy: query.groupBy ?? 'day' };
};

const zeroTotals = () => ({ pendingReview: 0, payable: 0, paid: 0 });
const fmtTotals = (t: { pendingReview: number; payable: number; paid: number }): BalanceTotals => ({
  pendingReview: money(t.pendingReview),
  payable: money(t.payable),
  paid: money(t.paid),
});

/** Pure: earnings summary from a runner's obligations and their adjustments. */
export const earningsSummaryOf = (
  rows: { line: RunnerPayoutLine; adjustments: AdjustmentStep[] }[],
  range: { from: string; to: string; groupBy: EarningsGroupBy },
): EarningsSummary => {
  const all = zeroTotals();
  const fee = zeroTotals();
  const item = zeroTotals();
  const starts: string[] = [];
  for (let t = Date.parse(`${range.from}T00:00:00Z`); t <= Date.parse(`${range.to}T00:00:00Z`); t += DAY_MS) {
    const start = bucketStart(new Date(t).toISOString().slice(0, 10), range.groupBy);
    if (starts[starts.length - 1] !== start) {
      starts.push(start);
    }
  }
  const buckets = new Map(starts.map((s) => [s, { runnerFee: 0, itemReimbursement: 0, paidOut: 0 }]));
  const inRange = (at: Date | null): string | null => {
    if (!at) {
      return null;
    }
    const day = eatDate(at);
    return day >= range.from && day <= range.to ? bucketStart(day, range.groupBy) : null;
  };
  for (const { line, adjustments } of rows) {
    const pos = linePositionOf(line, adjustments);
    const byType = line.lineType === T.RUNNER_FEE ? fee : item;
    for (const totals of [all, byType]) {
      totals.pendingReview += pos.pendingReview;
      totals.payable += pos.payable;
      totals.paid += pos.paid;
    }
    if (pos.status === S.PAYABLE || pos.status === S.PAID) {
      const earned = pos.payout?.state === 'sent' ? Number(pos.payout.amount) : Number(line.amount ?? 0);
      const bucket = buckets.get(inRange(line.createdAt) ?? '');
      if (bucket) {
        if (line.lineType === T.RUNNER_FEE) {
          bucket.runnerFee += earned;
        } else {
          bucket.itemReimbursement += earned;
        }
      }
    }
    if (pos.payout?.state === 'sent') {
      const bucket = buckets.get(inRange(pos.payout.at) ?? '');
      if (bucket) {
        bucket.paidOut += Number(pos.payout.amount);
      }
    }
  }
  const out = starts.map((start) => {
    const b = buckets.get(start)!;
    return {
      start,
      runnerFee: money(b.runnerFee),
      itemReimbursement: money(b.itemReimbursement),
      paidOut: money(b.paidOut),
    };
  });
  const sum = (k: 'runnerFee' | 'itemReimbursement' | 'paidOut') =>
    money([...buckets.values()].reduce((s, b) => s + b[k], 0));
  return {
    currency: 'KES',
    balance: fmtTotals(all),
    byType: { runnerFee: fmtTotals(fee), itemReimbursement: fmtTotals(item) },
    period: {
      ...range,
      timeZone: 'Africa/Nairobi',
      totals: { runnerFee: sum('runnerFee'), itemReimbursement: sum('itemReimbursement'), paidOut: sum('paidOut') },
      buckets: out,
    },
  };
};

/** Errand summary on ledger views. */
export interface LedgerErrandSummary {
  id: string;
  reference: string;
  title: string | null;
  category: ErrandCategory;
  status: ErrandStatus;
}

/**
 * One obligation as the runner sees it (GET /runners/me/payouts). No admin
 * notes, admin ids or M-Pesa receipts.
 */
export interface RunnerPayoutLineView {
  id: string;
  errandId: string;
  errand: LedgerErrandSummary | null;
  lineType: ObligationType;
  status: EffectiveLineStatus;
  /**
   * Payable/approved amount; once paid, the effective amount sent. Null while
   * in review or after a rejection.
   */
  amount: string | null;
  /** What the system computed or the runner claimed. */
  requestedAmount: string;
  reviewReason: RunnerPayoutReviewReason | null;
  createdAt: Date;
  decidedAt: Date | null;
  /** Time of the effective payout; null unless paid (and not reversed). */
  paidAt: Date | null;
}

export interface AdminRef {
  id: string;
  displayName: string | null;
}

/** Admin list item: the row plus effective status/payout and summaries. */
export type AdminRunnerPayoutItem = RunnerPayoutLine & {
  effectiveStatus: EffectiveLineStatus;
  effectivePayout: EffectiveRunnerPayout | null;
  errand: LedgerErrandSummary | null;
  runner: { id: string; displayName: string | null; shortName: string | null } | null;
  decidedBy: AdminRef | null;
  paidBy: AdminRef | null;
};

/** One adjustment as the admin sees it, oldest first (same names as refund corrections). */
export interface RunnerPayoutCorrectionView {
  id: string;
  kind: AdjustmentKind;
  previousReference: string | null;
  previousAmount: string | null;
  newReference: string | null;
  newAmount: string | null;
  reason: string;
  createdByUserId: string | null;
  createdBy: AdminRef | null;
  createdAt: Date;
}

/** Admin detail: item + runner payout contact, caps and adjustments. */
export type AdminRunnerPayoutDetail = AdminRunnerPayoutItem & {
  runner: {
    id: string;
    userId: string;
    displayName: string | null;
    shortName: string | null;
    /** Login phone: where the manual M-Pesa payout goes. */
    phone: string | null;
    maxPurchaseAdvance: string;
  } | null;
  /** Item lines: the item amount actually paid to Nitume now (cap, rows 105-106). */
  itemPaidToNitume: string | null;
  /** Item lines in review: highest amount an approval may carry, min(requested, item paid). */
  approvalCeiling: string | null;
  /** Adjustments, oldest first; empty unless paid. */
  corrections: RunnerPayoutCorrectionView[];
  /** Paid lines: highest `newAmount` a correction or re-sent payout may carry (the line amount). */
  correctionCeiling: string | null;
};

export interface ListRunnerPayoutsOptions {
  status?: EffectiveLineStatus;
  lineType?: ObligationType;
  runnerProfileId?: string;
  errandId?: string;
  cursor?: string;
  limit?: number;
}

export interface ReimbursementClaimInput {
  errandId: string;
  amount: number;
  receiptEvidenceId: string;
  note?: string;
}

export interface ReviewInput {
  decision: 'approve' | 'reject';
  amount?: number;
  note?: string;
}

export interface RunnerPayoutCorrectionInput {
  kind: AdjustmentKind;
  newReference?: string | null;
  newAmount?: number | null;
  reason: string;
  /** Latest adjustment id the admin saw (null: none); stale -> 409 payout_correction_conflict. */
  expectedLatestCorrectionId: string | null;
}

export const NOTE_MIN_LENGTH = 5;
export const NOTE_MAX_LENGTH = 500;
export const MAX_BATCH_LINES = 50;

/** Statuses in which a paid task's runner may claim item spend (row 106). */
export const CLAIMABLE_STATUSES: readonly ErrandStatus[] = [ErrandStatus.CANCELLED, ErrandStatus.FAILED];

const LATEST_ADJUSTMENT = `(SELECT a."lineType" FROM "runner_payout_lines" a
   WHERE a."relatedLineId" = l.id ORDER BY a."createdAt" DESC, a.id DESC LIMIT 1)`;

/**
 * Runner payout ledger (owner answers rows 104-108, system design §2.2, §6).
 * Records what Nitume owes runners as separate lines (runner fee, item
 * reimbursement), never a stored balance; ops review for receipt problems
 * and out-of-pocket claims; manual M-Pesa payouts and their append-only
 * corrections, reversals and re-sent payouts.
 */
@Injectable()
export class RunnerPayoutsService implements OnModuleInit {
  private readonly logger = new Logger(RunnerPayoutsService.name);

  constructor(
    @InjectRepository(RunnerPayoutLine)
    private readonly lines: Repository<RunnerPayoutLine>,
    @InjectRepository(PaymentTransaction)
    private readonly transactions: Repository<PaymentTransaction>,
    private readonly errands: ErrandsService,
    private readonly runners: RunnersService,
    private readonly evidence: EvidenceService,
    private readonly refunds: RefundsService,
    private readonly users: UsersService,
  ) {}

  /**
   * Row 104: the runner fee and item reimbursement lines are created when
   * the errand reaches CONFIRMED (receipt uploaded, customer confirmed,
   * dispute window closed without a dispute), inside the confirming
   * transaction. Nothing is payable to the runner before (row 95).
   */
  onModuleInit(): void {
    this.errands.onConfirmed(async (manager, change) => {
      await this.recordConfirmed(manager, change.errandId);
    });
  }

  /**
   * Creates the errand's obligations at CONFIRMED. Idempotent: one line per
   * errand and type (unique index; a second call inserts nothing).
   * - `runner_fee`: the completed runner-fee STK leg, payable.
   * - `item_reimbursement` (send_to_runner only: an item amount was paid to
   *   Nitume): payable for the item amount paid to Nitume, net of approved or
   *   sent price-decrease refunds; to ops review (row 105) when the runner
   *   uploaded no receipt, or (row 108) when it is above the runner's
   *   max_purchase_advance.
   */
  async recordConfirmed(manager: EntityManager, errandId: string): Promise<string[]> {
    const assignment = await this.errands.activeAssignmentFor(errandId);
    if (!assignment) {
      this.logger.warn(`Errand ${errandId} confirmed without a current runner; no payout lines`);
      return [];
    }
    const runner = await this.runners.profileById(assignment.runnerProfileId);
    const [fee, item] = await Promise.all([
      this.runnerFeePaid(errandId, manager),
      this.itemPaidToNitume(errandId, manager),
    ]);
    const created: string[] = [];
    if (fee > 0) {
      const id = await this.insertObligation(manager, {
        runnerProfileId: runner.id,
        errandId,
        lineType: T.RUNNER_FEE,
        status: S.PAYABLE,
        requestedAmount: fee,
        amount: fee,
        capAmount: null,
        reviewReason: null,
        receiptEvidenceId: null,
        note: 'Task confirmed: runner fee',
        createdByUserId: null,
      });
      if (id) {
        created.push(id);
      }
    }
    if (item > 0) {
      const [receipt] = await this.evidence.receiptsFor(errandId, runner.userId);
      const reason = !receipt
        ? RunnerPayoutReviewReason.RECEIPT_MISSING
        : item > Number(runner.maxPurchaseAdvance)
          ? RunnerPayoutReviewReason.OVER_PURCHASE_LIMIT
          : null;
      const id = await this.insertObligation(manager, {
        runnerProfileId: runner.id,
        errandId,
        lineType: T.ITEM_REIMBURSEMENT,
        status: reason ? S.PENDING_REVIEW : S.PAYABLE,
        requestedAmount: item,
        amount: reason ? null : item,
        capAmount: item,
        reviewReason: reason,
        receiptEvidenceId: receipt?.id ?? null,
        note: 'Task confirmed: item reimbursement',
        createdByUserId: null,
      });
      if (id) {
        created.push(id);
      }
    }
    return created;
  }

  /**
   * Row 106: the runner bought the item but the paid task ended CANCELLED or
   * FAILED. The runner claims verified out-of-pocket item spend with a
   * receipt they uploaded; the claim always goes to ops review, capped at the
   * item amount paid to Nitume. Never a runner_fee line.
   */
  async claim(runnerUserId: string, input: ReimbursementClaimInput): Promise<RunnerPayoutLineView> {
    const runner = await this.runners.profileByUserId(runnerUserId);
    const errand = await this.errands.getById(input.errandId);
    if (!CLAIMABLE_STATUSES.includes(errand.status)) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'reimbursement_claim_not_allowed',
        'Item spend can be claimed only on a task that ended cancelled or failed',
        { status: errand.status },
      );
    }
    const assignment = await this.errands.activeAssignmentFor(errand.id);
    if (!assignment || assignment.runnerProfileId !== runner.id) {
      throw new ForbiddenException('You were not the runner on this task');
    }
    const receipt = await this.evidence.findById(input.receiptEvidenceId);
    if (
      !receipt ||
      receipt.errandId !== errand.id ||
      receipt.type !== EvidenceType.RECEIPT ||
      receipt.uploadedBy !== runnerUserId
    ) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'receipt_required',
        'Upload the purchase receipt for this task first, then claim with it',
      );
    }
    const note = input.note?.trim() || null;
    const id = await this.lines.manager.transaction(async (manager) => {
      const cap = await this.itemPaidToNitume(errand.id, manager);
      if (cap <= 0) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'no_item_amount_paid',
          'No item amount was paid to Nitume on this task, so there is nothing to reimburse',
        );
      }
      if (input.amount <= 0 || input.amount > cap) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          'reimbursement_exceeds_cap',
          `The claim can't be more than KSh ${money(cap)}, the item amount paid to Nitume`,
          { cap: money(cap), itemPaidToNitume: money(cap) },
        );
      }
      const inserted = await this.insertObligation(manager, {
        runnerProfileId: runner.id,
        errandId: errand.id,
        lineType: T.ITEM_REIMBURSEMENT,
        status: S.PENDING_REVIEW,
        requestedAmount: input.amount,
        amount: null,
        capAmount: cap,
        reviewReason: RunnerPayoutReviewReason.OUT_OF_POCKET_CLAIM,
        receiptEvidenceId: receipt.id,
        note,
        createdByUserId: runnerUserId,
      });
      if (!inserted) {
        const existing = await manager
          .getRepository(RunnerPayoutLine)
          .findOne({ where: { errandId: errand.id, lineType: T.ITEM_REIMBURSEMENT } });
        throw new ApiError(
          HttpStatus.CONFLICT,
          'reimbursement_already_recorded',
          'An item reimbursement is already recorded for this task',
          { lineId: existing?.id ?? null },
        );
      }
      return inserted;
    });
    const [view] = await this.runnerViews(await this.lines.find({ where: { id: In([id]) } }));
    return view;
  }

  // ---- runner reads --------------------------------------------------------

  /** GET /runners/me/earnings: derived from the runner's lines. */
  async earningsFor(
    runnerUserId: string,
    query: { from?: string; to?: string; groupBy?: EarningsGroupBy },
  ): Promise<EarningsSummary> {
    const runner = await this.runners.profileByUserId(runnerUserId);
    return this.summaryFor(runner.id, query);
  }

  /** Earnings summary of one runner (runner app, or admin by runner id). */
  async summaryFor(
    runnerProfileId: string,
    query: { from?: string; to?: string; groupBy?: EarningsGroupBy },
  ): Promise<EarningsSummary> {
    const range = earningsRangeOf(query);
    const obligations = await this.lines.find({
      where: { runnerProfileId, lineType: In([...OBLIGATION_LINE_TYPES]) },
      order: { createdAt: 'ASC' },
    });
    const adjustments = await this.adjustmentsOf(obligations.map((l) => l.id));
    return earningsSummaryOf(
      obligations.map((line) => ({ line, adjustments: adjustments.get(line.id) ?? [] })),
      range,
    );
  }

  /** GET /runners/me/payouts: the runner's obligations, newest first (cursor). */
  async payoutsFor(
    runnerUserId: string,
    opts: Omit<ListRunnerPayoutsOptions, 'runnerProfileId' | 'errandId'>,
  ): Promise<{ items: RunnerPayoutLineView[]; nextCursor: string | null }> {
    const runner = await this.runners.profileByUserId(runnerUserId);
    const page = await this.page({ ...opts, runnerProfileId: runner.id });
    return { items: await this.runnerViews(page.rows), nextCursor: page.nextCursor };
  }

  // ---- admin ---------------------------------------------------------------

  /** Admin list of obligations, newest first. `status` is the effective status. */
  async list(opts: ListRunnerPayoutsOptions): Promise<{ items: AdminRunnerPayoutItem[]; nextCursor: string | null }> {
    const page = await this.page(opts);
    return { items: await this.enrich(page.rows), nextCursor: page.nextCursor };
  }

  /** `{ count }` of obligations, optionally in one effective status (badge). */
  async count(status?: EffectiveLineStatus): Promise<{ count: number }> {
    const qb = this.lines
      .createQueryBuilder('l')
      .where('l."lineType" IN (:...obligations)', { obligations: OBLIGATION_LINE_TYPES });
    if (status) {
      qb.andWhere(...statusFilter(status));
    }
    return { count: await qb.getCount() };
  }

  async detail(id: string): Promise<AdminRunnerPayoutDetail> {
    const line = await this.obligation(id);
    const [item] = await this.enrich([line]);
    const [adjustments, profile] = await Promise.all([
      this.adjustmentsOf([line.id]),
      this.runners.profileById(line.runnerProfileId).catch(() => null),
    ]);
    const own = adjustments.get(line.id) ?? [];
    const [user, names] = await Promise.all([
      profile ? this.users.findById(profile.userId) : Promise.resolve(null),
      this.users.displayNames(own.map((a) => a.createdByUserId).filter((v): v is string => !!v)),
    ]);
    const itemPaid =
      line.lineType === T.ITEM_REIMBURSEMENT ? await this.itemPaidToNitume(line.errandId) : null;
    const displayName = user?.displayName ?? null;
    return Object.assign(item, {
      runner: profile
        ? {
            id: profile.id,
            userId: profile.userId,
            displayName,
            shortName: shortNameOf(displayName),
            phone: user?.phone ?? null,
            maxPurchaseAdvance: profile.maxPurchaseAdvance,
          }
        : null,
      itemPaidToNitume: itemPaid === null ? null : money(itemPaid),
      approvalCeiling:
        itemPaid !== null && line.status === S.PENDING_REVIEW
          ? money(Math.max(0, Math.min(Number(line.requestedAmount), itemPaid)))
          : null,
      corrections: own.map((a) => toCorrectionView(a, names)),
      correctionCeiling: line.status === S.PAID ? money(line.amount) : null,
    });
  }

  /**
   * Ops review of an item reimbursement in `pending_review` (rows 105, 106,
   * 108). Approve with an amount, capped at min(requested amount, item amount
   * actually paid to Nitume): above it, 400 `reimbursement_exceeds_cap`.
   * Reject with a note (5-500 characters).
   */
  async review(id: string, input: ReviewInput, adminUserId: string): Promise<AdminRunnerPayoutDetail> {
    const note = input.note?.trim() || null;
    await this.lines.manager.transaction(async (manager) => {
      const repo = manager.getRepository(RunnerPayoutLine);
      const line = await this.lockObligation(manager, id);
      if (line.lineType !== T.ITEM_REIMBURSEMENT || line.status !== S.PENDING_REVIEW) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'runner_payout_not_in_review',
          `Only an item reimbursement in review can be decided (status ${line.status})`,
          { status: line.status, lineType: line.lineType },
        );
      }
      if (input.decision === 'reject') {
        assertNote(note, 'decision_note_required', 'Say why the reimbursement is rejected');
        await repo.update(line.id, {
          status: S.REJECTED,
          decisionNote: note,
          decidedByUserId: adminUserId,
          decidedAt: new Date(),
        });
        return;
      }
      const itemPaid = await this.itemPaidToNitume(line.errandId, manager);
      const ceiling = Math.max(0, Math.min(Number(line.requestedAmount), itemPaid));
      const amount = input.amount ?? 0;
      if (amount <= 0 || amount > ceiling) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          'reimbursement_exceeds_cap',
          `The reimbursement can't be more than KSh ${money(ceiling)} (the amount requested, at most the item amount paid to Nitume)`,
          {
            cap: money(ceiling),
            approvalCeiling: money(ceiling),
            requestedAmount: money(line.requestedAmount),
            itemPaidToNitume: money(itemPaid),
          },
        );
      }
      await repo.update(line.id, {
        status: S.PAYABLE,
        amount: money(amount),
        decisionNote: note,
        decidedByUserId: adminUserId,
        decidedAt: new Date(),
      });
    });
    return this.detail(id);
  }

  /**
   * Ops flag a receipt that does not match the purchase (row 105): an unpaid
   * payable item reimbursement goes back to `pending_review`
   * (`receipt_mismatch`) and stops being payable until decided again.
   */
  async hold(id: string, noteInput: string, adminUserId: string): Promise<AdminRunnerPayoutDetail> {
    const note = noteInput.trim();
    assertNote(note, 'decision_note_required', 'Say what does not match');
    await this.lines.manager.transaction(async (manager) => {
      const line = await this.lockObligation(manager, id);
      if (line.lineType !== T.ITEM_REIMBURSEMENT || line.status !== S.PAYABLE) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'runner_payout_not_holdable',
          `Only an unpaid, payable item reimbursement can go back to review (status ${line.status})`,
          { status: line.status, lineType: line.lineType },
        );
      }
      await manager.getRepository(RunnerPayoutLine).update(line.id, {
        status: S.PENDING_REVIEW,
        amount: null,
        reviewReason: RunnerPayoutReviewReason.RECEIPT_MISMATCH,
        decisionNote: note,
        decidedByUserId: adminUserId,
        decidedAt: new Date(),
      });
    });
    return this.detail(id);
  }

  /**
   * Records one manual M-Pesa payout covering one or more payable lines of
   * the same runner (batched payouts, §6). Lines and receipt are locked; a
   * paid line is final (409 `runner_payout_locked`, record a correction
   * instead); every line must be `payable` (409 `runner_payout_not_payable`);
   * one runner per payout (400 `runner_payout_mixed_runners`); a receipt on
   * a refund or another runner's payout is refused (409
   * `payout_reference_reused`).
   */
  async markPaid(
    lineIds: string[],
    payoutReference: string,
    adminUserId: string,
  ): Promise<{ items: AdminRunnerPayoutItem[] }> {
    const ids = [...new Set(lineIds)].sort();
    const reference = normalizeReference(payoutReference);
    await this.lines.manager.transaction(async (manager) => {
      const repo = manager.getRepository(RunnerPayoutLine);
      const rows = await repo.find({
        where: { id: In(ids), lineType: In([...OBLIGATION_LINE_TYPES]) },
        order: { id: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });
      if (rows.length !== ids.length) {
        throw new NotFoundException('Runner payout line not found');
      }
      for (const line of rows) {
        if (line.status === S.PAID) {
          throw new ApiError(
            HttpStatus.CONFLICT,
            'runner_payout_locked',
            'This line is already paid; its payout can only change through a correction',
            { lineId: line.id, payoutReference: line.payoutReference },
          );
        }
        if (line.status !== S.PAYABLE) {
          throw new ApiError(
            HttpStatus.CONFLICT,
            'runner_payout_not_payable',
            `Only payable lines can be paid (status ${line.status})`,
            { lineId: line.id, status: line.status },
          );
        }
      }
      const runnerIds = new Set(rows.map((r) => r.runnerProfileId));
      if (runnerIds.size !== 1) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          'runner_payout_mixed_runners',
          'One payout covers lines of one runner only',
        );
      }
      await this.assertRunnerReferenceFree(manager, reference, {
        runnerProfileId: rows[0].runnerProfileId,
        obligationIds: ids,
        isReversal: false,
      });
      const paidAt = new Date();
      for (const line of rows) {
        await repo.update(line.id, {
          status: S.PAID,
          payoutReference: reference,
          paidAt,
          paidByUserId: adminUserId,
        });
      }
    });
    const saved = await this.lines.find({ where: { id: In(ids) }, order: { createdAt: 'DESC' } });
    return { items: await this.enrich(saved) };
  }

  /**
   * Records a correction, reversal or re-sent payout on a `paid` line
   * (row 107; same rules as refund corrections, row 100). Append-only: the
   * line's original payout stays as recorded.
   * - `correction` (payout sent): new receipt and/or amount, at least one changed;
   * - `reversal` (payout sent): `newReference` = reversal M-Pesa code, no amount;
   * - `resend` (payout reversed): `newReference` and `newAmount` required.
   * `newAmount` must be > 0 and <= the line amount (400
   * `runner_payout_exceeds_amount` with `correctionCeiling`).
   */
  async addCorrection(
    id: string,
    input: RunnerPayoutCorrectionInput,
    adminUserId: string,
  ): Promise<AdminRunnerPayoutDetail> {
    const reason = input.reason.trim();
    assertNote(
      reason,
      'correction_reason_invalid',
      `Say why you're making this change (${NOTE_MIN_LENGTH}-${NOTE_MAX_LENGTH} characters)`,
    );
    const newReference = input.newReference ? normalizeReference(input.newReference) || null : null;
    const newAmount = input.newAmount ?? null;
    await this.lines.manager.transaction(async (manager) => {
      const line = await this.lockObligation(manager, id);
      if (line.status !== S.PAID) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'runner_payout_not_paid',
          `Corrections can only be added after a payout is recorded (status ${line.status})`,
          { status: line.status },
        );
      }
      const prior = (await this.adjustmentsOf([line.id], manager)).get(line.id) ?? [];
      const latestId = prior[prior.length - 1]?.id ?? null;
      if ((input.expectedLatestCorrectionId ?? null) !== latestId) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'payout_correction_conflict',
          'Another admin changed this payout. Check the latest before you save.',
          { latestCorrectionId: latestId },
        );
      }
      const current = effectiveRunnerPayoutOf(line, prior)!;
      const allowed = input.kind === T.RESEND ? current.state === 'reversed' : current.state === 'sent';
      if (!allowed) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'payout_correction_kind_invalid',
          `A ${input.kind} record is not allowed while the payout is ${current.state}`,
          { kind: input.kind, state: current.state },
        );
      }
      let reference = newReference;
      let amount = newAmount;
      if (input.kind === T.CORRECTION) {
        if (reference === (current.reference ?? '').toUpperCase()) {
          reference = null;
        }
        if (amount !== null && money(amount) === current.amount) {
          amount = null;
        }
        if (reference === null && amount === null) {
          throw new ApiError(
            HttpStatus.BAD_REQUEST,
            'correction_no_change',
            'Nothing to correct: the receipt and amount match the record.',
          );
        }
      } else if (!reference) {
        throw new ApiError(HttpStatus.BAD_REQUEST, 'payout_reference_required', 'Enter the M-Pesa code');
      }
      if (input.kind === T.REVERSAL && amount !== null) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          'payout_amount_not_allowed',
          'A reversal reverses the whole payout; send no amount (a partial reversal is a correction with the lower amount)',
        );
      }
      if (input.kind === T.RESEND && amount === null) {
        throw new ApiError(HttpStatus.BAD_REQUEST, 'payout_amount_required', 'Enter the amount sent');
      }
      if (amount !== null && (amount <= 0 || amount > Number(line.amount))) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          'runner_payout_exceeds_amount',
          `The amount can't be more than KSh ${money(line.amount)} for this line`,
          { correctionCeiling: money(line.amount) },
        );
      }
      if (reference) {
        await this.assertRunnerReferenceFree(manager, reference, {
          runnerProfileId: line.runnerProfileId,
          obligationIds: [line.id],
          isReversal: input.kind === T.REVERSAL,
        });
      }
      const repo = manager.getRepository(RunnerPayoutLine);
      await repo.insert({
        runnerProfileId: line.runnerProfileId,
        errandId: line.errandId,
        lineType: input.kind,
        status: S.RECORDED,
        relatedLineId: line.id,
        previousReference: current.reference,
        previousAmount: current.amount,
        payoutReference: reference,
        amount: amount === null ? null : money(amount),
        note: reason,
        createdByUserId: adminUserId,
      });
    });
    return this.detail(id);
  }

  // ---- internals -----------------------------------------------------------

  /** Item amount paid to Nitume for the task, net of committed decrease refunds (§6). */
  async itemPaidToNitume(errandId: string, manager?: EntityManager): Promise<number> {
    const [gross, decreases] = await Promise.all([
      this.legTotal(errandId, PaymentTypeCode.MERCHANT_PAYMENT, false, manager),
      this.refunds.committedRefundTotal(errandId, manager, [RefundTrigger.PRICE_CHANGE_DECREASE]),
    ]);
    return Math.max(0, Math.round((gross - decreases) * 100) / 100);
  }

  /** Runner fee the customer paid (completed leg of the main payment). */
  async runnerFeePaid(errandId: string, manager?: EntityManager): Promise<number> {
    return this.legTotal(errandId, PaymentTypeCode.RUNNER_FEE, true, manager);
  }

  private async legTotal(
    errandId: string,
    code: PaymentTypeCode,
    mainPaymentOnly: boolean,
    manager?: EntityManager,
  ): Promise<number> {
    const repo = manager ? manager.getRepository(PaymentTransaction) : this.transactions;
    const qb = repo
      .createQueryBuilder('t')
      .innerJoin(Payment, 'p', 'p.id = t."paymentId"')
      .innerJoin(PaymentType, 'pt', 'pt.id = t."paymentTypeId"')
      .select('COALESCE(SUM(t.amount), 0)', 'total')
      .where('p."errandId" = :errandId', { errandId })
      .andWhere('t.status = :completed', { completed: PaymentTransactionStatus.COMPLETED })
      .andWhere('pt.code = :code', { code });
    if (mainPaymentOnly) {
      qb.andWhere('p."priceChangeRequestId" IS NULL');
    }
    const raw = await qb.getRawOne<{ total: string }>();
    return Number(raw?.total ?? 0);
  }

  /** Inserts an obligation unless one exists for the errand and type; returns the new id or null. */
  private async insertObligation(
    manager: EntityManager,
    v: {
      runnerProfileId: string;
      errandId: string;
      lineType: ObligationType;
      status: RunnerPayoutLineStatus;
      requestedAmount: number;
      amount: number | null;
      capAmount: number | null;
      reviewReason: RunnerPayoutReviewReason | null;
      receiptEvidenceId: string | null;
      note: string | null;
      createdByUserId: string | null;
    },
  ): Promise<string | null> {
    const rows: { id: string }[] = await manager.query(
      `INSERT INTO "runner_payout_lines"
         ("runnerProfileId", "errandId", "lineType", "status", "requestedAmount", "amount",
          "capAmount", "reviewReason", "receiptEvidenceId", "note", "createdByUserId")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT ("errandId", "lineType") WHERE "lineType" IN ('runner_fee', 'item_reimbursement')
       DO NOTHING
       RETURNING "id"`,
      [
        v.runnerProfileId,
        v.errandId,
        v.lineType,
        v.status,
        money(v.requestedAmount),
        v.amount === null ? null : money(v.amount),
        v.capAmount === null ? null : money(v.capAmount),
        v.reviewReason,
        v.receiptEvidenceId,
        v.note,
        v.createdByUserId,
      ],
    );
    return rows[0]?.id ?? null;
  }

  private async obligation(id: string): Promise<RunnerPayoutLine> {
    const line = await this.lines.findOne({ where: { id } });
    if (!line || !OBLIGATION_LINE_TYPES.includes(line.lineType)) {
      throw new NotFoundException('Runner payout line not found');
    }
    return line;
  }

  private async lockObligation(manager: EntityManager, id: string): Promise<RunnerPayoutLine> {
    const line = await manager
      .getRepository(RunnerPayoutLine)
      .findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
    if (!line || !OBLIGATION_LINE_TYPES.includes(line.lineType)) {
      throw new NotFoundException('Runner payout line not found');
    }
    return line;
  }

  private async assertRunnerReferenceFree(
    manager: EntityManager,
    reference: string,
    target: { runnerProfileId: string; obligationIds: string[]; isReversal: boolean },
  ): Promise<void> {
    await lockPayoutReference(manager, reference);
    if (runnerReferenceConflict(await referenceUses(manager, reference), target)) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'payout_reference_reused',
        'This M-Pesa code is already recorded on a payout.',
        { reference: normalizeReference(reference) },
      );
    }
  }

  /** Adjustments per obligation id, oldest first (batched). */
  private async adjustmentsOf(
    obligationIds: string[],
    manager?: EntityManager,
  ): Promise<Map<string, RunnerPayoutLine[]>> {
    const out = new Map<string, RunnerPayoutLine[]>();
    if (obligationIds.length === 0) {
      return out;
    }
    const repo = manager ? manager.getRepository(RunnerPayoutLine) : this.lines;
    const rows = await repo.find({
      where: { relatedLineId: In(obligationIds) },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    for (const a of rows) {
      const key = a.relatedLineId as string;
      out.set(key, [...(out.get(key) ?? []), a]);
    }
    return out;
  }

  private async page(
    opts: ListRunnerPayoutsOptions,
  ): Promise<{ rows: RunnerPayoutLine[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
    const qb = this.lines
      .createQueryBuilder('l')
      .where('l."lineType" IN (:...obligations)', { obligations: OBLIGATION_LINE_TYPES })
      .orderBy('l."createdAt"', 'DESC')
      .addOrderBy('l.id', 'DESC')
      .limit(limit + 1);
    if (opts.status) {
      qb.andWhere(...statusFilter(opts.status));
    }
    if (opts.lineType) {
      qb.andWhere('l."lineType" = :lineType', { lineType: opts.lineType });
    }
    if (opts.runnerProfileId) {
      qb.andWhere('l."runnerProfileId" = :runnerProfileId', { runnerProfileId: opts.runnerProfileId });
    }
    if (opts.errandId) {
      qb.andWhere('l."errandId" = :errandId', { errandId: opts.errandId });
    }
    const decoded = decodeCursor(opts.cursor);
    if (decoded) {
      qb.andWhere('(l."createdAt" < :createdAt OR (l."createdAt" = :createdAt AND l.id < :id))', {
        createdAt: new Date(decoded[0]),
        id: decoded[1],
      });
    }
    const rows = await qb.getMany();
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return { rows: page, nextCursor: rows.length > limit && last ? encodeCursor(last) : null };
  }

  private async errandSummaries(errandIds: string[]): Promise<Map<string, LedgerErrandSummary>> {
    const errands = await this.errands.findByIds(errandIds);
    return new Map(
      errands.map((e) => [
        e.id,
        { id: e.id, reference: e.reference, title: e.title, category: e.category, status: e.status },
      ]),
    );
  }

  private async runnerViews(rows: RunnerPayoutLine[]): Promise<RunnerPayoutLineView[]> {
    const [errands, adjustments] = await Promise.all([
      this.errandSummaries(rows.map((r) => r.errandId)),
      this.adjustmentsOf(rows.map((r) => r.id)),
    ]);
    return rows.map((line) => {
      const pos = linePositionOf(line, adjustments.get(line.id));
      return {
        id: line.id,
        errandId: line.errandId,
        errand: errands.get(line.errandId) ?? null,
        lineType: line.lineType as ObligationType,
        status: pos.status,
        amount:
          pos.payout?.state === 'sent'
            ? pos.payout.amount
            : line.amount === null
              ? null
              : money(line.amount),
        requestedAmount: money(line.requestedAmount),
        reviewReason: line.reviewReason,
        createdAt: line.createdAt,
        decidedAt: line.decidedAt,
        paidAt: pos.payout?.state === 'sent' ? pos.payout.at : null,
      };
    });
  }

  private async enrich(rows: RunnerPayoutLine[]): Promise<AdminRunnerPayoutItem[]> {
    const [errands, adjustments, runners, names] = await Promise.all([
      this.errandSummaries(rows.map((r) => r.errandId)),
      this.adjustmentsOf(rows.map((r) => r.id)),
      this.runners.publicSummaries(rows.map((r) => r.runnerProfileId)),
      this.users.displayNames(
        rows.flatMap((r) => [r.decidedByUserId, r.paidByUserId]).filter((v): v is string => !!v),
      ),
    ]);
    const ref = (userId: string | null): AdminRef | null =>
      userId ? { id: userId, displayName: names.get(userId) ?? null } : null;
    return rows.map((line) => {
      const pos = linePositionOf(line, adjustments.get(line.id));
      const runner = runners.get(line.runnerProfileId);
      return Object.assign(line, {
        effectiveStatus: pos.status,
        effectivePayout: pos.payout,
        errand: errands.get(line.errandId) ?? null,
        runner: runner
          ? { id: runner.id, displayName: runner.displayName, shortName: runner.shortName }
          : null,
        decidedBy: ref(line.decidedByUserId),
        paidBy: ref(line.paidByUserId),
      });
    });
  }
}

const assertNote = (note: string | null, code: string, message: string): void => {
  if (!note || note.length < NOTE_MIN_LENGTH || note.length > NOTE_MAX_LENGTH) {
    throw new ApiError(HttpStatus.BAD_REQUEST, code, message, {
      minLength: NOTE_MIN_LENGTH,
      maxLength: NOTE_MAX_LENGTH,
    });
  }
};

/** Effective-status filter for list/count (a reversed payout counts as payable). */
const statusFilter = (status: EffectiveLineStatus): [string, Record<string, unknown>] => {
  switch (status) {
    case S.PAYABLE:
      return [
        `(l.status = :payable OR (l.status = :paid AND ${LATEST_ADJUSTMENT} = :reversal))`,
        { payable: S.PAYABLE, paid: S.PAID, reversal: T.REVERSAL },
      ];
    case S.PAID:
      return [
        `(l.status = :paid AND ${LATEST_ADJUSTMENT} IS DISTINCT FROM :reversal)`,
        { paid: S.PAID, reversal: T.REVERSAL },
      ];
    default:
      return ['l.status = :status', { status }];
  }
};

const toCorrectionView = (a: RunnerPayoutLine, names: Map<string, string>): RunnerPayoutCorrectionView => ({
  id: a.id,
  kind: a.lineType as AdjustmentKind,
  previousReference: a.previousReference,
  previousAmount: a.previousAmount,
  newReference: a.payoutReference,
  newAmount: a.amount,
  reason: a.note ?? '',
  createdByUserId: a.createdByUserId,
  createdBy: a.createdByUserId
    ? { id: a.createdByUserId, displayName: names.get(a.createdByUserId) ?? null }
    : null,
  createdAt: a.createdAt,
});

const encodeCursor = (row: RunnerPayoutLine): string =>
  Buffer.from(`${row.createdAt.toISOString()}::${row.id}`, 'utf-8').toString('base64');

const decodeCursor = (cursor: string | undefined): [string, string] | null => {
  if (!cursor) {
    return null;
  }
  const [createdAt, id] = Buffer.from(cursor, 'base64').toString('utf-8').split('::');
  return createdAt && id && !Number.isNaN(Date.parse(createdAt)) ? [createdAt, id] : null;
};
