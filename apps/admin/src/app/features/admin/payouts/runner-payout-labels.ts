import type {
  RunnerPayoutAdjustmentKind,
  RunnerPayoutCorrection,
  RunnerPayoutItem,
} from '../../../core/api-types';
import { categoryLabel, maskedId } from '../admin-data.service';
import type { CorrectionKind, PayoutCorrectionRecord } from './payout-correction';

/** Runner payout vocabulary (`_shared.md` §6.1, row 107). Unknown values title-cased. */
const titleCase = (value: string) =>
  value
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());

const KIND_LABELS: Record<string, string> = {
  runner_fee: 'Runner fee',
  item_reimbursement: 'Item reimbursement',
};

const REVIEW_REASON_LABELS: Record<string, string> = {
  receipt_missing: 'No receipt',
  receipt_mismatch: "Receipt doesn't match",
  out_of_pocket_claim: 'Claim after cancel/fail',
  over_purchase_limit: 'Above purchase limit',
};

export function runnerPayoutKindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? titleCase(kind);
}

export function reviewReasonLabel(reason: string | null | undefined): string {
  if (!reason) return '—';
  return REVIEW_REASON_LABELS[reason] ?? titleCase(reason);
}

type LineState = Pick<RunnerPayoutItem, 'effectiveStatus' | 'effectivePayout'>;

/** A paid line whose payout was reversed: owed again, re-sent from the drawer (never mark-paid). */
export function runnerPayoutReversed(line: LineState): boolean {
  return line.effectiveStatus === 'payable' && line.effectivePayout?.state === 'reversed';
}

/** A-02 `kind="runner_payout"` status: `payout_reversed` instead of `Payout due` while reversed. */
export function runnerPayoutChipStatus(line: LineState): string {
  return runnerPayoutReversed(line) ? 'payout_reversed' : line.effectiveStatus;
}

/** p-runner-payouts row button. */
export function runnerPayoutRowAction(line: LineState): 'Review' | 'Re-send' | 'View' {
  if (line.effectiveStatus === 'on_hold') return 'Review';
  if (runnerPayoutReversed(line)) return 'Re-send';
  return 'View';
}

/** `runner.shortName`, else `displayName`, else a masked id. */
export function runnerName(
  runner: { shortName: string | null; displayName: string | null } | null | undefined,
  runnerProfileId: string,
): string {
  return runner?.shortName || runner?.displayName || `Runner ${maskedId(runnerProfileId)}`;
}

/** Errand title, else the category display name. */
export function payoutTaskTitle(errand: RunnerPayoutItem['errand']): string {
  if (!errand) return 'Task';
  return errand.title || categoryLabel(errand.category);
}

/** `#` + the errand reference (`#NT-10482`). */
export function payoutTaskRef(line: Pick<RunnerPayoutItem, 'errand' | 'errandId'>): string {
  return line.errand?.reference ? `#${line.errand.reference}` : `#${maskedId(line.errandId)}`;
}

/** Amount column: `amount` when set, else the requested amount (captioned `requested`). */
export function runnerPayoutAmount(line: Pick<RunnerPayoutItem, 'amount' | 'requestedAmount'>): {
  value: string | null;
  requested: boolean;
} {
  return line.amount !== null
    ? { value: line.amount, requested: false }
    : { value: line.requestedAmount, requested: true };
}

const TO_FORM: Record<string, CorrectionKind> = {
  correction: 'corrected',
  reversal: 'reversed',
  resent_payout: 'resent',
};

export const TO_API_KIND: Record<CorrectionKind, RunnerPayoutAdjustmentKind> = {
  corrected: 'correction',
  reversed: 'reversal',
  resent: 'resent_payout',
};

/** An adjustment in the shared correction card's vocabulary. */
export function toCorrectionRecord(c: RunnerPayoutCorrection): PayoutCorrectionRecord {
  return { ...c, kind: TO_FORM[c.kind] ?? c.kind };
}
