/**
 * M-Pesa payment provider abstraction (owner answer row 73). One provider is
 * active, chosen by `PAYMENTS_PROVIDER`:
 * - `console`: dev/e2e mock, no money moves; its callbacks are trusted.
 * - `payhero`: PayHero STK push + transaction-status query (MVP provider).
 * - `daraja`: Safaricom Daraja push + STK Query, kept for later; no callback,
 *   IP allowlist or credential work (row 73).
 *
 * A real provider's callback is never trusted on its own: it only names the
 * payment, which is then confirmed by `queryStatus` before it is marked paid.
 * No credentials live in the repository.
 */
export interface StkInitiateRequest {
  /** Payer phone, `+2547XXXXXXXX`. */
  phone: string;
  /** KES, 2-decimal string. */
  amountKes: string;
  /** Nitume reference (`NTM-...`), sent as the provider's external reference. */
  reference: string;
  description: string;
  /** Shown by some providers (PayHero `customer_name`); optional. */
  customerName?: string | null;
}

export interface StkInitiateResult {
  /** Returned to the app as `checkoutRequestId`. */
  checkoutRequestId: string;
  transactionId: string;
  merchantRequestId?: string;
  /** Provider's own payment reference used to query status (PayHero `reference`). */
  providerReference?: string | null;
}

/** Everything stored about a push that a provider may need to look it up. */
export interface ProviderPaymentRef {
  reference: string;
  checkoutRequestId: string | null;
  providerReference: string | null;
}

/**
 * Provider status of a push. `pending` means no final result yet; the
 * payment stays unresolved.
 */
export interface StkQueryResult {
  state: 'success' | 'failed' | 'pending';
  resultCode: number | null;
  resultDesc: string | null;
  /** M-Pesa receipt when the provider returns one. */
  receiptNumber?: string | null;
}

/** A provider callback, normalised. */
export interface ParsedCallback {
  /** Our `NTM-...` reference (external reference), when present. */
  reference: string | null;
  checkoutRequestId: string | null;
  providerReference: string | null;
  /** What the callback claims; only applied directly when `trusted`. */
  claimed: StkQueryResult;
  /**
   * True only for the console mock. Real providers are verified by
   * `queryStatus` before anything is marked paid.
   */
  trusted: boolean;
}

export abstract class MpesaProvider {
  abstract readonly name: string;
  abstract initiateStk(req: StkInitiateRequest): Promise<StkInitiateResult>;
  abstract queryStatus(ref: ProviderPaymentRef): Promise<StkQueryResult>;
  /**
   * Normalises a callback body; null when the body is not a callback this
   * provider understands (the endpoint then answers 400).
   */
  abstract parseCallback(body: unknown): ParsedCallback | null;
}

export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/** `+2547XXXXXXXX` / `07XXXXXXXX` / `2547XXXXXXXX` -> `2547XXXXXXXX`. */
export const msisdn = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('0') ? `254${digits.slice(1)}` : digits;
};

/** Whole shillings for providers that take integers (never under-charges). */
export const wholeKes = (amountKes: string): number => Math.ceil(Number(amountKes));
