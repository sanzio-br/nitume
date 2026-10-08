/**
 * STK Push gateway abstraction. `console` is the dev/mock transport (records
 * the checkout reference, no money moves). `daraja` talks to Safaricom's
 * Daraja API (Lipa Na M-Pesa Online push + STK Query) and is only built when
 * every PAYMENTS_MPESA_* credential is configured; no credentials live in
 * the repository.
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

/**
 * Provider status of a push (Daraja STK Query, row 52). `pending` means the
 * provider has no final result yet; the payment stays unresolved.
 */
export interface StkQueryResult {
  state: 'success' | 'failed' | 'pending';
  resultCode: number | null;
  resultDesc: string | null;
}

export abstract class StkGateway {
  abstract readonly name: string;
  abstract push(req: StkPushRequest): Promise<StkPushResponse>;
  abstract query(checkoutRequestId: string): Promise<StkQueryResult>;
}
