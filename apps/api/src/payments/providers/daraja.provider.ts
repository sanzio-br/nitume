import { Injectable, Logger } from '@nestjs/common';
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

export interface DarajaConfig {
  baseUrl: string;
  consumerKey: string;
  consumerSecret: string;
  shortCode: string;
  passkey: string;
  callbackUrl: string;
}

/** Daraja config when every credential is set, else null. */
export const darajaConfigFrom = (config: ConfigService): DarajaConfig | null => {
  const get = (key: string) => config.get<string | null>(`payments.daraja.${key}`) ?? null;
  const cfg = {
    baseUrl: get('baseUrl') ?? 'https://sandbox.safaricom.co.ke',
    consumerKey: get('consumerKey'),
    consumerSecret: get('consumerSecret'),
    shortCode: get('shortCode'),
    passkey: get('passkey'),
    callbackUrl: get('callbackUrl'),
  };
  return cfg.consumerKey && cfg.consumerSecret && cfg.shortCode && cfg.passkey && cfg.callbackUrl
    ? (cfg as DarajaConfig)
    : null;
};

/** Daraja "request is still being processed" error code on STK Query. */
const STILL_PROCESSING = '500.001.1001';

/** `YYYYMMDDHHmmss` in Kenya time (EAT, UTC+3), as Daraja expects. */
export const darajaTimestamp = (now: Date = new Date()): string =>
  new Date(now.getTime() + 3 * 3_600_000).toISOString().replace(/\D/g, '').slice(0, 14);

/**
 * Safaricom Daraja client: Lipa Na M-Pesa Online (STK push) and STK Query.
 * A future provider (row 73): selected with PAYMENTS_PROVIDER=daraja and only
 * when all PAYMENTS_MPESA_* credentials are set. Daraja callbacks are not
 * handled (no Body.stkCallback adapter, IP allowlist or signature check):
 * payments resolve through STK Query only.
 */
@Injectable()
export class DarajaMpesaProvider extends MpesaProvider {
  readonly name = 'daraja';
  private readonly logger = new Logger(DarajaMpesaProvider.name);
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly cfg: DarajaConfig,
    private readonly http: FetchLike = fetch as unknown as FetchLike,
  ) {
    super();
  }

  async initiateStk(req: StkInitiateRequest): Promise<StkInitiateResult> {
    const timestamp = darajaTimestamp();
    const body = await this.post('/mpesa/stkpush/v1/processrequest', {
      BusinessShortCode: this.cfg.shortCode,
      Password: this.password(timestamp),
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: wholeKes(req.amountKes),
      PartyA: msisdn(req.phone),
      PartyB: this.cfg.shortCode,
      PhoneNumber: msisdn(req.phone),
      CallBackURL: this.cfg.callbackUrl,
      AccountReference: req.reference.slice(0, 12),
      TransactionDesc: req.description.slice(0, 13),
    });
    if (!body.ok || body.json.ResponseCode !== '0') {
      throw new Error(`Daraja STK push refused: ${describe(body.json)}`);
    }
    return {
      checkoutRequestId: String(body.json.CheckoutRequestID),
      merchantRequestId: String(body.json.MerchantRequestID),
      transactionId: String(body.json.CheckoutRequestID),
    };
  }

  async queryStatus(ref: ProviderPaymentRef): Promise<StkQueryResult> {
    const checkoutRequestId = ref.checkoutRequestId;
    if (!checkoutRequestId) {
      return { state: 'pending', resultCode: null, resultDesc: 'No checkout request id stored' };
    }
    const timestamp = darajaTimestamp();
    const body = await this.post('/mpesa/stkpushquery/v1/query', {
      BusinessShortCode: this.cfg.shortCode,
      Password: this.password(timestamp),
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    });
    if (!body.ok) {
      if (body.json.errorCode === STILL_PROCESSING) {
        return { state: 'pending', resultCode: null, resultDesc: describe(body.json) };
      }
      throw new Error(`Daraja STK query failed: ${describe(body.json)}`);
    }
    const resultCode = Number(body.json.ResultCode);
    if (Number.isNaN(resultCode)) {
      return { state: 'pending', resultCode: null, resultDesc: describe(body.json) };
    }
    return {
      state: resultCode === 0 ? 'success' : 'failed',
      resultCode,
      resultDesc: typeof body.json.ResultDesc === 'string' ? body.json.ResultDesc : null,
    };
  }

  /** Daraja callbacks are out of scope for MVP (row 73): always unrecognised. */
  parseCallback(_body: unknown): ParsedCallback | null {
    return null;
  }

  private password(timestamp: string): string {
    return Buffer.from(`${this.cfg.shortCode}${this.cfg.passkey}${timestamp}`).toString('base64');
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) {
      return this.token.value;
    }
    const basic = Buffer.from(`${this.cfg.consumerKey}:${this.cfg.consumerSecret}`).toString('base64');
    const res = await this.http(`${this.cfg.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
      method: 'GET',
      headers: { Authorization: `Basic ${basic}` },
    });
    const json = (await res.json()) as { access_token?: string; expires_in?: string | number };
    if (!res.ok || !json.access_token) {
      throw new Error(`Daraja OAuth failed (HTTP ${res.status})`);
    }
    // Refresh a minute early.
    const ttl = (Number(json.expires_in) || 3599) - 60;
    this.token = { value: json.access_token, expiresAt: Date.now() + ttl * 1000 };
    return this.token.value;
  }

  private async post(
    path: string,
    payload: Record<string, unknown>,
  ): Promise<{ ok: boolean; json: Record<string, unknown> }> {
    const res = await this.http(`${this.cfg.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await this.accessToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const json = ((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    if (!res.ok) {
      this.logger.warn(`Daraja ${path} HTTP ${res.status}: ${describe(json)}`);
    }
    return { ok: res.ok, json };
  }
}

const describe = (json: Record<string, unknown>): string => {
  const text = [json.errorMessage, json.ResultDesc, json.ResponseDescription].find(
    (v): v is string => typeof v === 'string',
  );
  return text ?? 'unknown';
};
