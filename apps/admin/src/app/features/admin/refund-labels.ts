import type { RefundReview } from '../../core/api-types';

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
  // TODO(owner-answers-4): `refundCeiling` is optional until N-9 is on main.
  return r.status === 'pending_review' ? (r.refundCeiling ?? r.amountPaid) : r.amountPaid;
}
