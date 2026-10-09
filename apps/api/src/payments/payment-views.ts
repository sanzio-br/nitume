import { PaymentFlow, PaymentStatus } from '../common/enums';
import { Payment } from './payment.entity';

/**
 * STK push status shown to the customer (owner decision Q21). TIMEOUT means
 * no provider result arrived within `payments.stkTimeoutSeconds`; it is NOT
 * a failure; a late callback can still move it to SUCCESS or FAILED.
 */
export enum StkStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  TIMEOUT = 'TIMEOUT',
}

/** Customer-selectable merchant payment routes (owner decision Q5 / A-6). */
export enum MerchantRoute {
  MERCHANT_DIRECT = 'merchant_direct',
  SEND_TO_RUNNER = 'send_to_runner',
}

export const ROUTE_TO_FLOW: Record<MerchantRoute, PaymentFlow> = {
  [MerchantRoute.MERCHANT_DIRECT]: PaymentFlow.MERCHANT_DIRECT,
  [MerchantRoute.SEND_TO_RUNNER]: PaymentFlow.CUSTOMER_TO_RUNNER,
};

export const routeOf = (flow: PaymentFlow): MerchantRoute | null => {
  switch (flow) {
    case PaymentFlow.MERCHANT_DIRECT:
      return MerchantRoute.MERCHANT_DIRECT;
    case PaymentFlow.CUSTOMER_TO_RUNNER:
      return MerchantRoute.SEND_TO_RUNNER;
    default:
      return null;
  }
};

export const stkStatusOf = (
  payment: Pick<Payment, 'status' | 'createdAt'>,
  timeoutSeconds: number,
  now: Date = new Date(),
): StkStatus => {
  switch (payment.status) {
    case PaymentStatus.COMPLETED:
    case PaymentStatus.REFUNDED:
      return StkStatus.SUCCESS;
    case PaymentStatus.FAILED:
      return StkStatus.FAILED;
    default:
      return now.getTime() - payment.createdAt.getTime() >= timeoutSeconds * 1000
        ? StkStatus.TIMEOUT
        : StkStatus.PENDING;
  }
};

/** Merchant Till/Paybill details for the merchant_direct route. */
export interface MerchantDetails {
  merchantName: string | null;
  tillNumber: string | null;
  paybillNumber: string | null;
  accountReference: string | null;
}

/**
 * How the customer settles the merchant/item amount. Till/Paybill fields
 * are present only for `merchant_direct`; null when there is no merchant
 * amount (platform-only errand).
 */
export type MerchantPaymentView =
  | ({ route: MerchantRoute.MERCHANT_DIRECT; amount: string } & MerchantDetails)
  | { route: MerchantRoute.SEND_TO_RUNNER; amount: string };
