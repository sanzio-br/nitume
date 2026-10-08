/** Refund trigger → `Reason` label (`_shared.md` §6, row 71). */
const TRIGGER_LABELS: Record<string, string> = {
  price_change_rejected: 'Price change rejected',
  dispute_customer_favourable: 'Dispute: sided with customer',
  cancelled_after_payment: 'Cancelled after payment',
  price_change_decrease: 'Price decrease',
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
