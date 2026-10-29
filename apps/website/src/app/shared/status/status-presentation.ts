// Task state → label/tone for customers and runners (ui-kit spec §4.2.3–§4.2.5).
// Ports `statusPresentation`, `runnerStatusPresentation` and
// `customerTimelineTitle` from packages/nitume_core. Admin labels are never
// used on the website.

/** The 17 wire values of `Nitume_System_Design.md` §3.3, in order. */
export const ERRAND_STATUSES = [
  'DRAFT',
  'REQUESTED',
  'QUOTED',
  'ACCEPTED',
  'PAYMENT_CONFIRMED',
  'RUNNER_ASSIGNED',
  'RUNNER_EN_ROUTE',
  'ARRIVED',
  'IN_PROGRESS',
  'AWAITING_CUSTOMER',
  'COMPLETED',
  'CONFIRMED',
  'SETTLED',
  'CANCELLED',
  'FAILED',
  'EXPIRED',
  'DISPUTED',
] as const;

export type ErrandStatus = (typeof ERRAND_STATUSES)[number];

/** Status chip tones: exactly the four design-system tones. */
export type StatusTone = 'success' | 'info' | 'pending' | 'danger';

export interface StatusPresentation {
  readonly label: string;
  readonly tone: StatusTone;
}

/**
 * Parses a wire string from the API. Unknown values give `null`: they are
 * never coerced to a label, so the caller shows no chip.
 */
export function parseErrandStatus(wire: unknown): ErrandStatus | null {
  return typeof wire === 'string' && (ERRAND_STATUSES as readonly string[]).includes(wire)
    ? (wire as ErrandStatus)
    : null;
}

/** Customer label and tone for every §3.3 state (C-06, OA-20). */
export function customerStatus(status: ErrandStatus): StatusPresentation {
  switch (status) {
    case 'DRAFT':
      return { label: 'Draft', tone: 'info' };
    case 'REQUESTED':
      return { label: 'Awaiting quote', tone: 'pending' };
    case 'QUOTED':
      return { label: 'Quote ready', tone: 'pending' };
    case 'ACCEPTED':
      return { label: 'Awaiting payment', tone: 'pending' };
    case 'PAYMENT_CONFIRMED':
    case 'RUNNER_ASSIGNED': // Row 176: an offer is not an acceptance.
      return { label: 'Finding a runner', tone: 'info' };
    case 'RUNNER_EN_ROUTE': // Row 182, OA-13: amber.
      return { label: 'En route', tone: 'pending' };
    case 'ARRIVED':
      return { label: 'Arrived', tone: 'info' };
    case 'IN_PROGRESS':
      return { label: 'In progress', tone: 'info' };
    case 'AWAITING_CUSTOMER':
      return { label: 'Needs your review', tone: 'pending' };
    case 'COMPLETED':
    case 'CONFIRMED': // System-only (row 35).
    case 'SETTLED': // System-only (row 35).
      return { label: 'Completed', tone: 'success' };
    case 'CANCELLED':
      return { label: 'Cancelled', tone: 'danger' };
    case 'FAILED':
      return { label: 'Failed', tone: 'danger' };
    case 'EXPIRED':
      return { label: 'Expired', tone: 'info' };
    case 'DISPUTED':
      return { label: 'Disputed', tone: 'danger' };
    default: {
      const _: never = status;
      throw new Error(`Unhandled errand status: ${String(_)}`);
    }
  }
}

/**
 * Customer timeline step title (C-19): the offer step (RUNNER_ASSIGNED) is
 * hidden, RUNNER_EN_ROUTE is the acceptance step.
 */
export function customerTimelineTitle(status: ErrandStatus): string | null {
  if (status === 'RUNNER_ASSIGNED') return null;
  if (status === 'RUNNER_EN_ROUTE') return 'Runner assigned';
  return customerStatus(status).label;
}

export interface RunnerStatusOptions {
  /** RUNNER_ASSIGNED: `false` while the offer is open. Defaults to `true`. */
  readonly offerAccepted?: boolean;
}

/**
 * Runner label and tone for every §3.3 state (R-01). States before the
 * offer never reach the runner and return `null` (render nothing).
 */
export function runnerStatus(
  status: ErrandStatus,
  opts: RunnerStatusOptions = {},
): StatusPresentation | null {
  const offerAccepted = opts.offerAccepted ?? true;
  switch (status) {
    case 'DRAFT':
    case 'REQUESTED':
    case 'QUOTED':
    case 'ACCEPTED':
      return null;
    case 'PAYMENT_CONFIRMED': // Defensive only; parity with the built Flutter map.
      return { label: 'New offer', tone: 'info' };
    case 'RUNNER_ASSIGNED':
      return offerAccepted
        ? { label: 'Accepted', tone: 'info' }
        : { label: 'New offer', tone: 'info' };
    case 'RUNNER_EN_ROUTE':
      return { label: 'On the way', tone: 'pending' };
    case 'ARRIVED':
      return { label: 'Arrived', tone: 'info' };
    case 'IN_PROGRESS':
      return { label: 'In progress', tone: 'info' };
    case 'AWAITING_CUSTOMER':
      return { label: 'Waiting for the customer', tone: 'pending' };
    case 'COMPLETED':
    case 'CONFIRMED':
      return { label: 'Completed', tone: 'success' };
    case 'SETTLED':
      return { label: 'Paid', tone: 'success' };
    case 'CANCELLED':
      return { label: 'Cancelled', tone: 'danger' };
    case 'FAILED':
      return { label: 'Failed', tone: 'danger' };
    case 'EXPIRED':
      return { label: 'Expired', tone: 'info' };
    case 'DISPUTED':
      return { label: 'Disputed', tone: 'danger' };
    default: {
      const _: never = status;
      throw new Error(`Unhandled errand status: ${String(_)}`);
    }
  }
}
