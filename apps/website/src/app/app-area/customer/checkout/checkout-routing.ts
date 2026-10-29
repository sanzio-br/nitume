// Entry routing of the three #8 routes (A§2): one pure table, used by the
// quote, payment and item-payment pages (no copied switch). Every page
// reads `GET /errands/:id` first and calls this before rendering.
import { ErrandStatus } from '../../../shared/status/status-presentation';
import { customerLinks } from '../customer-links';

export type CheckoutView = 'quote' | 'payment' | 'item-payment';

const PRE_QUOTE: readonly ErrandStatus[] = ['REQUESTED', 'QUOTED'];
const PAID_ACTIVE: readonly ErrandStatus[] = [
  'PAYMENT_CONFIRMED',
  'RUNNER_ASSIGNED',
  'RUNNER_EN_ROUTE',
  'ARRIVED',
  'IN_PROGRESS',
  'AWAITING_CUSTOMER',
];

/**
 * The URL to replace the current one with, or `null` to render. Terminal
 * states and DRAFT go to Task detail.
 */
export function checkoutRedirect(view: CheckoutView, status: ErrandStatus, id: string): string | null {
  if (PRE_QUOTE.includes(status)) return view === 'quote' ? null : customerLinks.awaitingQuote(id);
  if (status === 'ACCEPTED') return view === 'item-payment' ? customerLinks.awaitingQuote(id) : null;
  if (PAID_ACTIVE.includes(status)) return view === 'quote' ? customerLinks.track(id) : null;
  return customerLinks.taskDetail(id);
}
