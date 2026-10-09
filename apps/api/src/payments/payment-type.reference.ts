import { PaymentTypeCode } from '../common/enums';

/** Reference data upserted lazily by PaymentsService on bootstrap. */
export const PAYMENT_TYPES = [
  {
    code: PaymentTypeCode.SERVICE_FEE,
    name: 'Service fee',
    description: 'Nitume platform commission charged to the customer',
  },
  {
    code: PaymentTypeCode.RUNNER_FEE,
    name: 'Runner fee',
    description: 'Delivery/execution fee paid out to the runner',
  },
  {
    code: PaymentTypeCode.MERCHANT_PAYMENT,
    name: 'Merchant payment',
    description:
      'Purchase amount collected by Nitume STK for send_to_runner; the runner is reimbursed through the payout ledger',
  },
  {
    code: PaymentTypeCode.RUNNER_ADVANCE,
    name: 'Runner advance',
    description: 'Advance disbursed to the runner before delivery',
  },
] as const;