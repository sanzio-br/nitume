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
  | RunnerPayoutLineType.RESENT_PAYOUT;

/**
 * Status of an obligation as clients see it: the stored status, except that
 * a `paid` line whose payout was reversed (and not re-sent) is `payable`
 * again (owed), like refunds (row 100).
 */
export type EffectiveLineStatus =
  | RunnerPayoutLineStatus.ON_HOLD
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

type AdjustmentStep = Pick<RunnerPayoutLine, 'kind' | 'payoutReference' | 'amount' | 'createdAt'>;

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
    switch (a.kind) {
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
      case T.RESENT_PAYOUT:
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
  /** On hold for ops review (requested amount, not guaranteed). */
  onHold: number;
  /**
   * Owed and not paid out: a payable line; a paid line whose payout was
   * reversed (owed again); or the part of a paid line not actually sent
   * after a correction to a lower amount.
   */
  available: number;
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
  const amount = Number(line.amount ?? 0);
  const sent = payout?.state === 'sent' ? Number(payout.amount) : 0;
  return {
    status,
    payout,
    onHold: status === S.ON_HOLD ? Number(line.requestedAmount ?? 0) : 0,
    available: status === S.PAYABLE ? amount : payout?.state === 'sent' ? Math.max(0, amount - sent) : 0,
    paid: sent,
  };
};

export type EarningsGroupBy = 'day' | 'week' | 'month';

/** Balance figures of one kind of line, KES strings. */
export interface KindTotals {
  availableAmount: string;
  onHoldAmount: string;
  paidAmount: string;
}

export interface EarningsBucket {
  /** First day of the bucket, YYYY-MM-DD in East Africa Time. */
  start: string;
  /** Runner fees earned (approved lines, by the day the line was created). */
  runnerFeeAmount: string;
  /** Item reimbursements (not income: money the runner spent on the purchase). */
  itemReimbursementAmount: string;
  /** Effective payouts sent in the bucket. */
  paidOutAmount: string;
}

/**
 * Runner earnings (RA-14), derived from the ledger lines; nothing is stored
 * (row 107, no wallet). `availableAmount` is the Runner app's "available
 * balance": what Nitume owes for confirmed tasks minus payouts sent
 * (system design §6).
 */
export interface EarningsSummary {
  currency: 'KES';
  /** Payable lines + reversed payouts not yet re-sent - nothing else. */
  availableAmount: string;
  /**
   * Runner fee + item amount of the runner's tasks waiting for confirmation
   * (AWAITING_CUSTOMER, COMPLETED, DISPUTED): not on the ledger yet.
   */
  pendingAmount: string;
  /** Item reimbursements on hold for ops review (requested amounts). */
  onHoldAmount: string;
  /** Effective total paid out. */
  paidAmount: string;
  byKind: { runnerFee: KindTotals; itemReimbursement: KindTotals };
  /** Current EAT week, Monday to Sunday: runner-fee earnings per day (chart). */
  week: { day: string; runnerFeeAmount: string }[];
  weekTotal: string;
  /** Breakdown for the requested range (`from`, `to`, `groupBy`). */
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

const addDays = (day: string, n: number): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

const bucketStart = (day: string, groupBy: EarningsGroupBy): string => {
  if (groupBy === 'month') {
    return `${day.slice(0, 7)}-01`;
  }
  if (groupBy === 'week') {
    const monday = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
    return addDays(day, -monday);
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
  const from = query.from ?? (DATE.test(to) ? addDays(to, -6) : to);
  const valid = (d: string) => DATE.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
  const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS;
  if (!valid(from) || !valid(to) || !(span >= 0) || span >= MAX_EARNINGS_RANGE_DAYS) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      'earnings_range_invalid',
      `Give from/to as YYYY-MM-DD, from on or before to, at most ${MAX_EARNINGS_RANGE_DAYS} days`,
      { from, to },
    );
  }
  return { from, to, groupBy: query.groupBy ?? 'day' };
};

const zeroTotals = () => ({ available: 0, onHold: 0, paid: 0 });
const fmtTotals = (t: { available: number; onHold: number; paid: number }): KindTotals => ({
  availableAmount: money(t.available),
  onHoldAmount: money(t.onHold),
  paidAmount: money(t.paid),
});

/** Pure: earnings summary from a runner's obligations and their adjustments. */
export const earningsSummaryOf = (
  rows: { line: RunnerPayoutLine; adjustments: AdjustmentStep[] }[],
  range: { from: string; to: string; groupBy: EarningsGroupBy },
  pendingAmount = 0,
  now: Date = new Date(),
): EarningsSummary => {
  const all = zeroTotals();
  const fee = zeroTotals();
  const item = zeroTotals();
  const starts: string[] = [];
  for (let day = range.from; day <= range.to; day = addDays(day, 1)) {
    const start = bucketStart(day, range.groupBy);
    if (starts[starts.length - 1] !== start) {
      starts.push(start);
    }
  }
  const buckets = new Map(starts.map((s) => [s, { fee: 0, item: 0, paidOut: 0 }]));
  const weekStart = bucketStart(eatDate(now), 'week');
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const week = new Map(weekDays.map((d) => [d, 0]));
  const bucketOf = (at: Date | null) => {
    if (!at) {
      return undefined;
    }
    const day = eatDate(at);
    return day >= range.from && day <= range.to ? buckets.get(bucketStart(day, range.groupBy)) : undefined;
  };
  for (const { line, adjustments } of rows) {
    const pos = linePositionOf(line, adjustments);
    for (const totals of [all, line.kind === T.RUNNER_FEE ? fee : item]) {
      totals.available += pos.available;
      totals.onHold += pos.onHold;
      totals.paid += pos.paid;
    }
    if (pos.status === S.PAYABLE || pos.status === S.PAID) {
      const earned = Number(line.amount ?? 0);
      const bucket = bucketOf(line.createdAt);
      if (bucket) {
        if (line.kind === T.RUNNER_FEE) {
          bucket.fee += earned;
        } else {
          bucket.item += earned;
        }
      }
      const day = eatDate(line.createdAt);
      if (line.kind === T.RUNNER_FEE && week.has(day)) {
        week.set(day, (week.get(day) ?? 0) + earned);
      }
    }
    const paidBucket = pos.payout?.state === 'sent' ? bucketOf(pos.payout.at) : undefined;
    if (paidBucket) {
      paidBucket.paidOut += pos.paid;
    }
  }
  const total = (k: 'fee' | 'item' | 'paidOut') => money([...buckets.values()].reduce((s, b) => s + b[k], 0));
  return {
    currency: 'KES',
    availableAmount: money(all.available),
    pendingAmount: money(pendingAmount),
    onHoldAmount: money(all.onHold),
    paidAmount: money(all.paid),
    byKind: { runnerFee: fmtTotals(fee), itemReimbursement: fmtTotals(item) },
    week: weekDays.map((day) => ({ day, runnerFeeAmount: money(week.get(day)) })),
    weekTotal: money([...week.values()].reduce((s, v) => s + v, 0)),
    period: {
      ...range,
      timeZone: 'Africa/Nairobi',
      totals: {
        runnerFeeAmount: total('fee'),
        itemReimbursementAmount: total('item'),
        paidOutAmount: total('paidOut'),
      },
      buckets: starts.map((start) => {
        const b = buckets.get(start)!;
        return {
          start,
          runnerFeeAmount: money(b.fee),
          itemReimbursementAmount: money(b.item),
          paidOutAmount: money(b.paidOut),
        };
      }),
    },
  };
};

/** Kinds on the runner's payout feed (RA-14). `payout` is derived, not stored. */
export type PayoutFeedKind =
  | RunnerPayoutLineType.RUNNER_FEE
  | RunnerPayoutLineType.ITEM_REIMBURSEMENT
  | RunnerPayoutLineType.CORRECTION
  | RunnerPayoutLineType.REVERSAL
  | RunnerPayoutLineType.RESENT_PAYOUT
  | 'payout';

export const PAYOUT_FEED_KINDS: readonly PayoutFeedKind[] = [
  T.RUNNER_FEE,
  T.ITEM_REIMBURSEMENT,
  'payout',
  T.CORRECTION,
  T.REVERSAL,
  T.RESENT_PAYOUT,
];

/**
 * One entry of GET /runners/me/payout-lines (RA-14). Signed amounts: positive
 * = owed to the runner, negative = paid out. The sum of the entries of lines
 * not on hold or rejected is `availableAmount`. No admin notes, admin ids,
 * review reasons' free text or customer data.
 */
export interface PayoutFeedItem {
  /** Line id; `payout:<first line id>` for a derived payout entry (opaque). */
  id: string;
  kind: PayoutFeedKind;
  /**
   * Job lines: on_hold | payable | paid | rejected (a reversed payout makes
   * the line payable again). payout and resent_payout: paid. correction and
   * reversal: recorded.
   */
  status: EffectiveLineStatus | RunnerPayoutLineStatus.RECORDED;
  /** Signed KES, e.g. "1750.00" or "-6000.00". */
  amount: string;
  /** Null on a payout covering several tasks. */
  errandId: string | null;
  errandTitle: string | null;
  errandReference: string | null;
  /** M-Pesa receipt (payout, resent_payout, correction, reversal code); null on job lines. */
  reference: string | null;
  /** Adjustments: the job line they change. Null otherwise. */
  relatedLineId: string | null;
  /** payout entries: the job lines the M-Pesa payout covered. Empty otherwise. */
  lineIds: string[];
  /** Job lines on hold: why (`receipt_missing`, `receipt_mismatch`, `out_of_pocket_claim`, `over_purchase_limit`). */
  reviewReason: RunnerPayoutReviewReason | null;
  createdAt: Date;
  /** Job lines: when the line became payable; null while on hold or rejected. */
  payableAt: Date | null;
  /** payout / resent_payout: when it was sent. Job lines: their original payout time. */
  paidAt: Date | null;
}

type FeedErrand = { reference: string; title: string | null };

/** Pure: the runner's payout feed, newest first, from obligations and their adjustments. */
export const payoutFeedOf = (
  rows: { line: RunnerPayoutLine; adjustments: RunnerPayoutLine[] }[],
  errands: Map<string, FeedErrand>,
): PayoutFeedItem[] => {
  const base = (errandId: string | null) => ({
    errandId,
    errandTitle: errandId ? (errands.get(errandId)?.title ?? null) : null,
    errandReference: errandId ? (errands.get(errandId)?.reference ?? null) : null,
  });
  const items: PayoutFeedItem[] = [];
  const payouts = new Map<string, RunnerPayoutLine[]>();
  for (const { line, adjustments } of rows) {
    const pos = linePositionOf(line, adjustments);
    const approved = line.amount !== null;
    items.push({
      id: line.id,
      kind: line.kind as PayoutFeedKind,
      status: pos.status,
      amount: money(approved ? line.amount : line.requestedAmount),
      ...base(line.errandId),
      reference: null,
      relatedLineId: null,
      lineIds: [],
      reviewReason: pos.status === S.ON_HOLD ? line.reviewReason : null,
      createdAt: line.createdAt,
      payableAt: approved && pos.status !== S.REJECTED ? (line.decidedAt ?? line.createdAt) : null,
      paidAt: line.paidAt,
    });
    if (line.status === S.PAID && line.paidAt) {
      const key = `${line.payoutReference ?? ''}|${line.paidAt.toISOString()}`;
      payouts.set(key, [...(payouts.get(key) ?? []), line]);
    }
    for (const a of adjustments) {
      const previous = Number(a.previousAmount ?? 0);
      const signed =
        a.kind === T.REVERSAL
          ? previous
          : a.kind === T.RESENT_PAYOUT
            ? -Number(a.amount ?? 0)
            : a.amount === null
              ? 0
              : previous - Number(a.amount);
      items.push({
        id: a.id,
        kind: a.kind as PayoutFeedKind,
        status: a.kind === T.RESENT_PAYOUT ? S.PAID : S.RECORDED,
        amount: money(signed),
        ...base(line.errandId),
        reference: a.payoutReference,
        relatedLineId: line.id,
        lineIds: [],
        reviewReason: null,
        createdAt: a.createdAt,
        payableAt: null,
        paidAt: a.kind === T.RESENT_PAYOUT ? a.createdAt : null,
      });
    }
  }
  for (const group of payouts.values()) {
    const ids = group.map((l) => l.id).sort();
    const errandIds = [...new Set(group.map((l) => l.errandId))];
    items.push({
      id: `payout:${ids[0]}`,
      kind: 'payout',
      status: S.PAID,
      amount: money(-group.reduce((s, l) => s + Number(l.amount ?? 0), 0)),
      ...base(errandIds.length === 1 ? errandIds[0] : null),
      reference: group[0].payoutReference,
      relatedLineId: null,
      lineIds: ids,
      reviewReason: null,
      createdAt: group[0].paidAt as Date,
      payableAt: null,
      paidAt: group[0].paidAt,
    });
  }
  return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1));
};

/**
 * Pure: highest amount an ops approval may carry on an item line (rows 105,
 * 135): the lowest of the requested amount, the item amount paid to Nitume
 * now, the cap stored on the line when it was created (`capAmount`) and the
 * runner's max_purchase_advance; never below 0.
 */
export const approvalCeilingOf = (
  line: Pick<RunnerPayoutLine, 'requestedAmount' | 'capAmount'>,
  itemPaid: number,
  maxPurchaseAdvance?: string | number | null,
): number => {
  const caps = [Number(line.requestedAmount), itemPaid];
  if (maxPurchaseAdvance !== null && maxPurchaseAdvance !== undefined) {
    caps.push(Number(maxPurchaseAdvance));
  }
  if (line.capAmount !== null && line.capAmount !== undefined) {
    caps.push(Number(line.capAmount));
  }
  return Math.max(0, Math.min(...caps));
};

/** Errand summary on ledger views. */
export interface LedgerErrandSummary {
  id: string;
  reference: string;
  title: string | null;
  category: ErrandCategory;
  status: ErrandStatus;
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
  /** Item lines in review: highest amount an approval may carry (requested, item paid, capAmount, max_purchase_advance). */
  approvalCeiling: string | null;
  /** Adjustments, oldest first; empty unless paid. */
  corrections: RunnerPayoutCorrectionView[];
  /** Paid lines: highest `newAmount` a correction or re-sent payout may carry (the line amount). */
  correctionCeiling: string | null;
};

export interface ListRunnerPayoutsOptions {
  status?: EffectiveLineStatus;
  kind?: ObligationType;
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
/** Tasks whose earnings are waiting for confirmation (`pendingAmount`). */
export const AWAITING_CONFIRMATION: readonly ErrandStatus[] = [
  ErrandStatus.AWAITING_CUSTOMER,
  ErrandStatus.COMPLETED,
  ErrandStatus.DISPUTED,
];

export const CLAIMABLE_STATUSES: readonly ErrandStatus[] = [ErrandStatus.CANCELLED, ErrandStatus.FAILED];

const LATEST_ADJUSTMENT = `(SELECT a."kind" FROM "runner_payout_lines" a
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
    const assignment = await this.errands.activeAssignmentFor(errandId, manager);
    if (!assignment) {
      this.logger.warn(`Errand ${errandId} confirmed without a current runner; no payout lines`);
      return [];
    }
    const runner = await this.runners.profileById(assignment.runnerProfileId, manager);
    const [fee, item] = await Promise.all([
      this.runnerFeePaid(errandId, manager),
      this.itemPaidToNitume(errandId, manager),
    ]);
    const created: string[] = [];
    if (fee > 0) {
      const id = await this.insertObligation(manager, {
        runnerProfileId: runner.id,
        errandId,
        kind: T.RUNNER_FEE,
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
      const [receipt] = await this.evidence.receiptsFor(errandId, runner.userId, manager);
      const reason = !receipt
        ? RunnerPayoutReviewReason.RECEIPT_MISSING
        : item > Number(runner.maxPurchaseAdvance)
          ? RunnerPayoutReviewReason.OVER_PURCHASE_LIMIT
          : null;
      const id = await this.insertObligation(manager, {
        runnerProfileId: runner.id,
        errandId,
        kind: T.ITEM_REIMBURSEMENT,
        status: reason ? S.ON_HOLD : S.PAYABLE,
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
   * receipt they uploaded; the claim always goes to ops review (`on_hold`),
   * capped at the item amount paid to Nitume and the runner's
   * max_purchase_advance. Never a runner_fee line.
   */
  async claim(runnerUserId: string, input: ReimbursementClaimInput): Promise<PayoutFeedItem> {
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
      const itemPaid = await this.itemPaidToNitume(errand.id, manager);
      // Row 105 cap (item amount paid to Nitume) and row 108 limit
      // (the runner's max_purchase_advance) both apply.
      const cap = Math.min(itemPaid, Number(runner.maxPurchaseAdvance));
      if (itemPaid <= 0) {
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
          `The claim can't be more than KSh ${money(cap)} (the item amount paid to Nitume, within your purchase limit)`,
          { cap: money(cap), itemPaidToNitume: money(itemPaid), maxPurchaseAdvance: money(runner.maxPurchaseAdvance) },
        );
      }
      const inserted = await this.insertObligation(manager, {
        runnerProfileId: runner.id,
        errandId: errand.id,
        kind: T.ITEM_REIMBURSEMENT,
        status: S.ON_HOLD,
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
          .findOne({ where: { errandId: errand.id, kind: T.ITEM_REIMBURSEMENT } });
        throw new ApiError(
          HttpStatus.CONFLICT,
          'reimbursement_already_recorded',
          'An item reimbursement is already recorded for this task',
          { lineId: existing?.id ?? null },
        );
      }
      return inserted;
    });
    const [line] = await this.lines.find({ where: { id: In([id]) } });
    const [item] = payoutFeedOf([{ line, adjustments: [] }], await this.errandSummaries([line.errandId]));
    return item;
  }

  // ---- runner reads --------------------------------------------------------

  /** GET /runners/me/earnings: derived from the runner's lines (RA-14). */
  async earningsFor(
    runnerUserId: string,
    query: { from?: string; to?: string; groupBy?: EarningsGroupBy },
  ): Promise<EarningsSummary> {
    const runner = await this.runners.profileByUserId(runnerUserId);
    return this.summaryFor(runner.id, query, runnerUserId);
  }

  /**
   * Earnings summary of one runner (runner app, or admin by runner id).
   * `pendingAmount` adds the runner fee and item amount of the runner's tasks
   * still waiting for confirmation (no ledger line yet).
   */
  async summaryFor(
    runnerProfileId: string,
    query: { from?: string; to?: string; groupBy?: EarningsGroupBy },
    runnerUserId?: string,
  ): Promise<EarningsSummary> {
    const range = earningsRangeOf(query);
    const obligations = await this.lines.find({
      where: { runnerProfileId, kind: In([...OBLIGATION_LINE_TYPES]) },
      order: { createdAt: 'ASC' },
    });
    const userId = runnerUserId ?? (await this.runners.profileById(runnerProfileId)).userId;
    const [adjustments, pending] = await Promise.all([
      this.adjustmentsOf(obligations.map((l) => l.id)),
      this.pendingConfirmation(userId),
    ]);
    return earningsSummaryOf(
      obligations.map((line) => ({ line, adjustments: adjustments.get(line.id) ?? [] })),
      range,
      pending,
    );
  }

  /**
   * GET /runners/me/payout-lines (RA-14, RA-16): the runner's feed, newest
   * first, cursor-paginated. `kinds` filters (e.g. ['payout',
   * 'resent_payout']); `errandId` restricts to one task's lines, their
   * adjustments and the payouts that covered them.
   */
  async payoutLinesFor(
    runnerUserId: string,
    opts: { kinds?: PayoutFeedKind[]; errandId?: string; cursor?: string; limit?: number },
  ): Promise<{ items: PayoutFeedItem[]; nextCursor: string | null }> {
    const runner = await this.runners.profileByUserId(runnerUserId);
    const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
    const obligations = await this.lines.find({
      where: {
        runnerProfileId: runner.id,
        kind: In([...OBLIGATION_LINE_TYPES]),
        ...(opts.errandId ? { errandId: opts.errandId } : {}),
      },
    });
    const [adjustments, errands] = await Promise.all([
      this.adjustmentsOf(obligations.map((l) => l.id)),
      this.errandSummaries(obligations.map((l) => l.errandId)),
    ]);
    let feed = payoutFeedOf(
      obligations.map((line) => ({ line, adjustments: adjustments.get(line.id) ?? [] })),
      errands,
    );
    if (opts.kinds && opts.kinds.length > 0) {
      const kinds = new Set<string>(opts.kinds);
      feed = feed.filter((i) => kinds.has(i.kind));
    }
    const decoded = decodeCursor(opts.cursor);
    if (decoded) {
      const at = Date.parse(decoded[0]);
      feed = feed.filter(
        (i) => i.createdAt.getTime() < at || (i.createdAt.getTime() === at && i.id < decoded[1]),
      );
    }
    const page = feed.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page,
      nextCursor:
        feed.length > limit && last
          ? Buffer.from(`${last.createdAt.toISOString()}::${last.id}`, 'utf-8').toString('base64')
          : null,
    };
  }

  /**
   * Runner fee + item amount of the runner's tasks awaiting confirmation
   * (tasks where the runner holds the current assignment), in one aggregate
   * query with no cap on the number of tasks. The item amount is net of
   * approved or sent price-decrease refunds at their effective value (a
   * reversed, not re-sent refund stays committed, row 111), as in
   * `itemPaidToNitume`.
   */
  async pendingConfirmation(runnerUserId: string): Promise<number> {
    const rows: { total: string | null }[] = await this.lines.manager.query(
      `WITH mine AS (
         SELECT e.id FROM "errands" e
           JOIN "runner_profiles" rp ON rp."userId" = $1
          WHERE e.status::text = ANY($2)
            AND (SELECT a."runnerProfileId" FROM "errand_assignments" a
                  WHERE a."errandId" = e.id AND a.status IN ('assigned', 'accepted')
                  ORDER BY a."createdAt" DESC LIMIT 1) = rp.id
       ),
       legs AS (
         SELECT COALESCE(SUM(t.amount) FILTER (
                  WHERE pt.code = 'runner_fee' AND p."priceChangeRequestId" IS NULL), 0)
              + COALESCE(SUM(t.amount) FILTER (WHERE pt.code = 'merchant_payment'), 0) AS total
           FROM "payment_transactions" t
           JOIN "payments" p ON p.id = t."paymentId"
           JOIN "payment_type" pt ON pt.id = t."paymentTypeId"
          WHERE p."errandId" IN (SELECT id FROM mine) AND t.status = 'completed'
       ),
       decreases AS (
         SELECT COALESCE(SUM(CASE
                  WHEN r.status = 'approved' OR latest.kind = 'reversed' THEN r."refundAmount"
                  ELSE COALESCE(sent."newAmount", r."refundAmount") END), 0) AS total
           FROM "refund_reviews" r
           LEFT JOIN LATERAL (
             SELECT c.kind FROM "refund_payout_corrections" c
              WHERE c."refundReviewId" = r.id ORDER BY c."createdAt" DESC, c.id DESC LIMIT 1
           ) latest ON true
           LEFT JOIN LATERAL (
             SELECT c."newAmount" FROM "refund_payout_corrections" c
              WHERE c."refundReviewId" = r.id AND c."newAmount" IS NOT NULL
              ORDER BY c."createdAt" DESC, c.id DESC LIMIT 1
           ) sent ON true
          WHERE r."errandId" IN (SELECT id FROM mine)
            AND r.trigger = 'price_change_decrease' AND r.status IN ('approved', 'refunded')
       )
       SELECT GREATEST((SELECT total FROM legs) - (SELECT total FROM decreases), 0) AS total`,
      [runnerUserId, [...AWAITING_CONFIRMATION]],
    );
    return Number(rows[0]?.total ?? 0);
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
      .where('l."kind" IN (:...obligations)', { obligations: OBLIGATION_LINE_TYPES });
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
      line.kind === T.ITEM_REIMBURSEMENT ? await this.itemPaidToNitume(line.errandId) : null;
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
        itemPaid !== null && line.status === S.ON_HOLD
          ? money(approvalCeilingOf(line, itemPaid, profile?.maxPurchaseAdvance))
          : null,
      corrections: own.map((a) => toCorrectionView(a, names)),
      correctionCeiling: line.status === S.PAID ? money(line.amount) : null,
    });
  }

  /**
   * Ops review of an item reimbursement in `on_hold` (rows 105, 106,
   * 108). Approve with an amount, capped at min(requested amount, item amount
   * actually paid to Nitume): above it, 400 `reimbursement_exceeds_cap`.
   * Reject with a note (5-500 characters).
   */
  async review(id: string, input: ReviewInput, adminUserId: string): Promise<AdminRunnerPayoutDetail> {
    const note = input.note?.trim() || null;
    await this.lines.manager.transaction(async (manager) => {
      const repo = manager.getRepository(RunnerPayoutLine);
      const line = await this.lockObligation(manager, id);
      if (line.kind !== T.ITEM_REIMBURSEMENT || line.status !== S.ON_HOLD) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'runner_payout_not_in_review',
          `Only an item reimbursement in review can be decided (status ${line.status})`,
          { status: line.status, kind: line.kind },
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
      const [itemPaid, runner] = await Promise.all([
        this.itemPaidToNitume(line.errandId, manager),
        this.runners.profileById(line.runnerProfileId, manager),
      ]);
      // Row 135: min(item amount paid to Nitume, the runner's max_purchase_advance).
      const ceiling = approvalCeilingOf(line, itemPaid, runner.maxPurchaseAdvance);
      const amount = input.amount ?? 0;
      if (amount <= 0 || amount > ceiling) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          'reimbursement_exceeds_cap',
          `The reimbursement can't be more than KSh ${money(ceiling)} (the amount requested, at most the item amount paid to Nitume and the runner's purchase limit)`,
          {
            cap: money(ceiling),
            approvalCeiling: money(ceiling),
            requestedAmount: money(line.requestedAmount),
            itemPaidToNitume: money(itemPaid),
            capAmount: line.capAmount === null ? null : money(line.capAmount),
            maxPurchaseAdvance: money(runner.maxPurchaseAdvance),
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
   * payable item reimbursement goes back to `on_hold`
   * (`receipt_mismatch`) and stops being payable until decided again.
   */
  async hold(id: string, noteInput: string, adminUserId: string): Promise<AdminRunnerPayoutDetail> {
    const note = noteInput.trim();
    assertNote(note, 'decision_note_required', 'Say what does not match');
    await this.lines.manager.transaction(async (manager) => {
      const line = await this.lockObligation(manager, id);
      if (line.kind !== T.ITEM_REIMBURSEMENT || line.status !== S.PAYABLE) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'runner_payout_not_holdable',
          `Only an unpaid, payable item reimbursement can go back to review (status ${line.status})`,
          { status: line.status, kind: line.kind },
        );
      }
      await manager.getRepository(RunnerPayoutLine).update(line.id, {
        status: S.ON_HOLD,
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
        where: { id: In(ids), kind: In([...OBLIGATION_LINE_TYPES]) },
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
      const allowed = input.kind === T.RESENT_PAYOUT ? current.state === 'reversed' : current.state === 'sent';
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
      if (input.kind === T.RESENT_PAYOUT && amount === null) {
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
        kind: input.kind,
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
      kind: ObligationType;
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
         ("runnerProfileId", "errandId", "kind", "status", "requestedAmount", "amount",
          "capAmount", "reviewReason", "receiptEvidenceId", "note", "createdByUserId")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT ("errandId", "kind") WHERE "kind" IN ('runner_fee', 'item_reimbursement')
       DO NOTHING
       RETURNING "id"`,
      [
        v.runnerProfileId,
        v.errandId,
        v.kind,
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
    if (!line || !OBLIGATION_LINE_TYPES.includes(line.kind)) {
      throw new NotFoundException('Runner payout line not found');
    }
    return line;
  }

  private async lockObligation(manager: EntityManager, id: string): Promise<RunnerPayoutLine> {
    const line = await manager
      .getRepository(RunnerPayoutLine)
      .findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
    if (!line || !OBLIGATION_LINE_TYPES.includes(line.kind)) {
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
      .where('l."kind" IN (:...obligations)', { obligations: OBLIGATION_LINE_TYPES })
      .orderBy('l."createdAt"', 'DESC')
      .addOrderBy('l.id', 'DESC')
      .limit(limit + 1);
    if (opts.status) {
      qb.andWhere(...statusFilter(opts.status));
    }
    if (opts.kind) {
      qb.andWhere('l."kind" = :kind', { kind: opts.kind });
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
  kind: a.kind as AdjustmentKind,
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
