import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FetchLike,
  MpesaProvider,
  ParsedCallback,
  ProviderPaymentRef,
  StkInitiateRequest,
  StkInitiateResult,
  StkQueryResult,
  msisdn,
  wholeKes,
} from './mpesa-provider';

export interface PayHeroConfig {
  /** e.g. https://backend.payhero.co.ke/api/v2 (owner to confirm). */
  baseUrl: string;
  /** The ready-made Basic auth token from the PayHero dashboard. */
  authToken: string;
  /** Payment channel id of the Nitume till/paybill in PayHero. */
  channelId: number;
  /** Public URL of POST /api/v1/payments/mpesa/callback. */
  callbackUrl: string;
  /** Per-request timeout. */
  timeoutMs: number;
}

/** PayHero config when every required value is set, else null. */
export const payHeroConfigFrom = (config: ConfigService): PayHeroConfig | null => {
  const get = <T>(key: string) => config.get<T | null>(`payments.payhero.${key}`) ?? null;
  const baseUrl = get<string>('baseUrl');
  const authToken = get<string>('authToken');
  const channelId = Number(get<string | number>('channelId'));
  const callbackUrl = get<string>('callbackUrl');
  if (!baseUrl || !authToken || !Number.isInteger(channelId) || channelId <= 0 || !callbackUrl) {
    return null;
  }
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    authToken,
    channelId,
    callbackUrl,
    timeoutMs: Number(get<number>('timeoutMs')) || 15_000,
  };
};

type Json = Record<string, unknown>;

const SUCCESS = new Set(['SUCCESS', 'SUCCESSFUL', 'COMPLETED', 'COMPLETE', 'PAID']);
const FAILED = new Set(['FAILED', 'FAILURE', 'CANCELLED', 'CANCELED', 'REJECTED', 'EXPIRED', 'REVERSED']);

const str = (...values: unknown[]): string | null => {
  for (const v of values) {
    if (typeof v === 'string' && v.trim().length > 0) {
      return v.trim();
    }
    if (typeof v === 'number' && Number.isFinite(v)) {
      return String(v);
    }
  }
  return null;
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') {
    return null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Maps a PayHero status (and ResultCode when present) to a state. Unknown
 * values stay pending: nothing is ever marked paid on a value we do not
 * recognise.
 */
export const payHeroState = (status: string | null, resultCode: number | null): StkQueryResult['state'] => {
  const s = (status ?? '').toUpperCase();
  if (SUCCESS.has(s)) {
    return 'success';
  }
  if (FAILED.has(s)) {
    return 'failed';
  }
  if (!s && resultCode !== null) {
    return resultCode === 0 ? 'success' : 'failed';
  }
  return 'pending';
};

/**
 * PayHero (https://payhero.co.ke) M-Pesa STK client, from the endpoints the
 * owner's reference client uses:
 * - POST {baseUrl}/payments  { amount, phone_number, channel_id,
 *   provider: 'm-pesa', external_reference, customer_name, callback_url }
 * - GET  {baseUrl}/transaction-status?reference={PayHero reference}
 * Auth: `Authorization: Basic {authToken}` (token as issued by PayHero).
 *
 * The push is never retried automatically (a retry could charge twice);
 * a failed status query is retried by the caller's job. Auth headers and
 * payer phone numbers are never logged.
 *
 * PayHero's callback payload and any signing scheme are not verified from
 * here, so `parseCallback` is tolerant and untrusted: it only identifies the
 * payment, which is then confirmed with `queryStatus`.
 */
export class PayHeroMpesaProvider extends MpesaProvider {
  readonly name = 'payhero';
  private readonly logger = new Logger(PayHeroMpesaProvider.name);

  constructor(
    private readonly cfg: PayHeroConfig,
    private readonly http: FetchLike = fetch as unknown as FetchLike,
  ) {
    super();
  }

  async initiateStk(req: StkInitiateRequest): Promise<StkInitiateResult> {
    const payload: Json = {
      amount: wholeKes(req.amountKes),
      phone_number: msisdn(req.phone),
      channel_id: this.cfg.channelId,
      provider: 'm-pesa',
      external_reference: req.reference,
      callback_url: this.cfg.callbackUrl,
    };
    if (req.customerName) {
      payload.customer_name = req.customerName.slice(0, 100);
    }
    const res = await this.request('POST', '/payments', payload);
    const body = res.json;
    if (!res.ok || body.success === false) {
      throw new Error(`PayHero STK push refused (HTTP ${res.status}): ${describe(body)}`);
    }
    const providerReference = str(body.reference, body.Reference);
    const checkout = str(body.CheckoutRequestID, body.checkout_request_id);
    if (!providerReference && !checkout) {
      throw new Error('PayHero STK push returned no reference');
    }
    return {
      checkoutRequestId: checkout ?? (providerReference as string),
      transactionId: providerReference ?? (checkout as string),
      providerReference,
    };
  }

  async queryStatus(ref: ProviderPaymentRef): Promise<StkQueryResult> {
    if (!ref.providerReference) {
      return { state: 'pending', resultCode: null, resultDesc: 'No PayHero reference stored' };
    }
    const res = await this.request(
      'GET',
      `/transaction-status?reference=${encodeURIComponent(ref.providerReference)}`,
    );
    if (!res.ok) {
      throw new Error(`PayHero status query failed (HTTP ${res.status}): ${describe(res.json)}`);
    }
    const body = res.json;
    const resultCode = num(body.ResultCode ?? body.result_code);
    const status = str(body.status, body.Status);
    const state = payHeroState(status, resultCode);
    return {
      state,
      resultCode: state === 'success' ? 0 : resultCode,
      resultDesc: str(body.ResultDesc, body.result_desc, body.status_description, status),
      receiptNumber: str(
        body.third_party_reference,
        body.MpesaReceiptNumber,
        body.provider_reference,
      ),
    };
  }

  /**
   * Tolerant parse of a PayHero callback: the fields may sit at the top level
   * or under `response`, in PascalCase (M-Pesa style) or snake_case. Needs at
   * least one identifier (external reference, checkout id or PayHero
   * reference); the claimed result is never applied without `queryStatus`.
   */
  parseCallback(body: unknown): ParsedCallback | null {
    if (typeof body !== 'object' || body === null) {
      return null;
    }
    const top = body as Json;
    const inner = typeof top.response === 'object' && top.response !== null ? (top.response as Json) : top;
    const reference = str(inner.ExternalReference, inner.external_reference, top.external_reference);
    const checkoutRequestId = str(inner.CheckoutRequestID, inner.checkout_request_id);
    const providerReference = str(inner.Reference, inner.reference, top.reference);
    if (!reference && !checkoutRequestId && !providerReference) {
      return null;
    }
    const resultCode = num(inner.ResultCode ?? inner.result_code);
    const status = str(inner.Status, inner.status);
    return {
      reference,
      checkoutRequestId,
      providerReference,
      claimed: {
        state: payHeroState(status, resultCode),
        resultCode,
        resultDesc: str(inner.ResultDesc, inner.result_desc),
        receiptNumber: str(inner.MpesaReceiptNumber, inner.mpesa_receipt_number),
      },
      trusted: false,
    };
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    payload?: Json,
  ): Promise<{ ok: boolean; status: number; json: Json }> {
    const res = await this.http(`${this.cfg.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${this.cfg.authToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: payload ? JSON.stringify(payload) : undefined,
      signal: AbortSignal.timeout(this.cfg.timeoutMs),
    });
    const json = ((await res.json().catch(() => ({}))) ?? {}) as Json;
    if (!res.ok) {
      // Path without the query string: references are not secrets, but keep logs lean.
      this.logger.warn(`PayHero ${method} ${path.split('?')[0]} HTTP ${res.status}: ${describe(json)}`);
    }
    return { ok: res.ok, status: res.status, json };
  }
}

const describe = (json: Json): string =>
  str(json.error_message, json.message, json.error, json.ResultDesc, json.status) ?? 'unknown';
