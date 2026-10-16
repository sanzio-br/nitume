/** Payments-module domain events read by other modules (no DI). */

/** Domain event: merchant details changed after a merchant-direct payment started (row 80). */
export const MERCHANT_DETAILS_CHANGED_EVENT = 'merchant_details.changed';

export interface MerchantDetailsChangedEvent {
  errandId: string;
  merchantName: string | null;
  tillNumber: string | null;
  paybillNumber: string | null;
  accountReference: string | null;
  merchantDetailsUpdatedAt: string;
}

/**
 * Domain event: an errand went RUNNER_ASSIGNED -> EXPIRED and its refund
 * review (if the customer had paid) is open, so the customer notification can
 * say whether a refund is being reviewed (owner decision 2026-10-16).
 * Emitted after the refund backstop for every EXPIRED transition.
 */
export const ERRAND_EXPIRED_EVENT = 'errand.expired';

export interface ErrandExpiredEvent {
  errandId: string;
  refundReviewOpened: boolean;
}
