/**
 * STK Push gateway abstraction. `console` is the dev/mock transport (records
 * the checkout reference, no money moves). Real M-Pesa Daraja (Lipa Na
 * M-Pesa Online, B2C payouts) requires a live or sandbox Daraja account and
 * the dedicated `mpesa` module behind PAYMENTS_MPESA_TRANSPORT=daraja —
 * wiring up a real Daraja account requires project-owner approval (build
 * brief §3: never commit a real third-party account "just for testing").
 */
export interface StkPushRequest {
  phone: string;
  amountKes: string;
  reference: string;
  description: string;
}

export interface StkPushResponse {
  checkoutRequestId: string;
  transactionId: string;
  merchantRequestId?: string;
}

export abstract class StkGateway {
  abstract readonly name: string;
  abstract push(req: StkPushRequest): Promise<StkPushResponse>;
}