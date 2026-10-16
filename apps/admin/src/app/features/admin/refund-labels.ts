import type { AdminRef, RefundReview } from '../../core/api-types';
import { maskedId } from './admin-data.service';

/** Refund trigger → `Reason` label (`_shared.md` §6, rows 71, 102). */
const TRIGGER_LABELS: Record<string, string> = {
  price_change_rejected: 'Price change rejected',
  dispute_customer_favourable: 'Dispute: sided with customer',
  cancelled_after_payment: 'Cancelled after payment',
  price_change_decrease: 'Price decrease',
  expired_after_payment: 'Task expired',
  failed_after_payment: 'Task failed',
};

export function refundTriggerLabel(trigger: string | null | undefined): string {
  if (!trigger) return '—';
  return (
    TRIGGER_LABELS[trigger] ??
    trigger
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/\b[a-z]/g, (c) => c.toUpperCase())
  );
}

/**
 * What can be refunded in this review (rows 81, 87): the API's net
 * `refundCeiling` while pending, else the review's `amountPaid`.
 * Shared by the refund drawer and the p-refunds `Refundable` column.
 */
export function reviewCeiling(
  r: Pick<RefundReview, 'status' | 'amountPaid' | 'refundCeiling'>,
): string {
  return r.status === 'pending_review' && r.refundCeiling !== null ? r.refundCeiling : r.amountPaid;
}

const CORRECTION_KIND_LABELS: Record<string, string> = {
  corrected: 'Payout corrected',
  reversed: 'Payout reversed',
  resent: 'New payout sent',
};

/** Payout correction kind → card / form label (drawer-refund "Kinds", row 100). */
export function correctionKindLabel(kind: string): string {
  return CORRECTION_KIND_LABELS[kind] ?? refundTriggerLabel(kind);
}

/** A `refunded` review whose latest correction is a reversal: the refund is owed again. */
export function payoutReversed(r: Pick<RefundReview, 'status' | 'effectivePayout'>): boolean {
  return r.status === 'refunded' && r.effectivePayout?.state === 'reversed';
}

/**
 * Status for the refund chip (A-02 `kind="refund"`): `payout_reversed`
 * (`Payout reversed`, amber) instead of `Refunded` while the effective
 * payout is reversed (`_shared.md` §6, row 100). Panel and drawer.
 */
export function refundChipStatus(r: Pick<RefundReview, 'status' | 'effectivePayout'>): string {
  return payoutReversed(r) ? 'payout_reversed' : r.status;
}

/** p-refunds row button: `Record payout` for approved and reversed payouts (row 100). */
export function refundRowAction(r: Pick<RefundReview, 'status' | 'effectivePayout'>): string {
  if (r.status === 'pending_review') return 'Review';
  if (r.status === 'approved' || payoutReversed(r)) return 'Record payout';
  return 'View';
}

/**
 * Admin who decided, paid or corrected (N-2): `You` for the signed-in
 * admin, else the name, else a masked id.
 */
export function adminLabel(
  ref: AdminRef | null | undefined,
  userId: string | null | undefined,
  meId: string | null | undefined,
): string {
  const id = ref?.id ?? userId;
  if (!id) return '—';
  if (meId && id === meId) return 'You';
  return ref?.displayName ?? maskedId(id);
}
