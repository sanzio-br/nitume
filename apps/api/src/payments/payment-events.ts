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
 * review (if the customer had paid) is open. Emitted after the refund
 * backstop for every EXPIRED transition; the customer notification is queued
 * from it. `refundReviewOpened` is for ops listeners only: the customer copy
 * never mentions a review (row 158).
 */
export const ERRAND_EXPIRED_EVENT = 'errand.expired';

export interface ErrandExpiredEvent {
  errandId: string;
  refundReviewOpened: boolean;
}
