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
