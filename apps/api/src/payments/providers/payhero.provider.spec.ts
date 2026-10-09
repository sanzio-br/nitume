import { describe, expect, it, vi } from 'vitest';
import { PayHeroMpesaProvider, payHeroConfigFrom, payHeroState } from './payhero.provider';

const cfg = {
  baseUrl: 'https://payhero.test/api/v2',
  authToken: 'dGVzdDp0ZXN0',
  channelId: 911,
  callbackUrl: 'https://api.test/api/v1/payments/mpesa/callback',
  timeoutMs: 5000,
};

const reply = (ok: boolean, json: unknown, status = ok ? 200 : 500) =>
  Promise.resolve({ ok, status, json: () => Promise.resolve(json) });

const build = (handler: () => ReturnType<typeof reply>) => {
  const http = vi.fn(() => handler());
  return { provider: new PayHeroMpesaProvider(cfg, http), http };
};

type Call = [string, { method: string; headers: Record<string, string>; body?: string }];

describe('PayHeroMpesaProvider.initiateStk (row 73)', () => {
  it('POSTs /payments with the reference-client payload and Basic auth', async () => {
    const { provider, http } = build(() =>
      reply(true, { success: true, status: 'QUEUED', reference: 'PH-REF-1', CheckoutRequestID: 'ws_CO_1' }),
    );
    const out = await provider.initiateStk({
      phone: '+254712345678',
      amountKes: '166.50',
      reference: 'NTM-ABC',
      description: 'Nitume errand NT-1',
      customerName: 'Amina Wanjiru',
    });
    expect(out).toEqual({
      checkoutRequestId: 'ws_CO_1',
      transactionId: 'PH-REF-1',
      providerReference: 'PH-REF-1',
    });
    const [url, init] = http.mock.calls[0] as unknown as Call;
    expect(url).toBe('https://payhero.test/api/v2/payments');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Basic dGVzdDp0ZXN0');
    expect(JSON.parse(init.body as string)).toEqual({
      amount: 167,
      phone_number: '254712345678',
      channel_id: 911,
      provider: 'm-pesa',
      external_reference: 'NTM-ABC',
      customer_name: 'Amina Wanjiru',
      callback_url: cfg.callbackUrl,
    });
  });

  it('throws when PayHero refuses the push (never retried here)', async () => {
    const { provider, http } = build(() => reply(false, { error_message: 'Insufficient balance' }, 400));
    await expect(
      provider.initiateStk({ phone: '0712345678', amountKes: '10.00', reference: 'NTM-1', description: 'x' }),
    ).rejects.toThrow(/Insufficient balance/);
    expect(http).toHaveBeenCalledTimes(1);
  });
});

describe('PayHeroMpesaProvider.queryStatus', () => {
  const ref = { reference: 'NTM-1', checkoutRequestId: 'ws_CO_1', providerReference: 'PH-REF-1' };

  it('GETs /transaction-status with the PayHero reference and maps SUCCESS', async () => {
    const { provider, http } = build(() =>
      reply(true, { status: 'SUCCESS', third_party_reference: 'SAE3YULR0Y', reference: 'PH-REF-1' }),
    );
    await expect(provider.queryStatus(ref)).resolves.toEqual({
      state: 'success',
      resultCode: 0,
      resultDesc: 'SUCCESS',
      receiptNumber: 'SAE3YULR0Y',
    });
    const [url, init] = http.mock.calls[0] as unknown as Call;
    expect(url).toBe('https://payhero.test/api/v2/transaction-status?reference=PH-REF-1');
    expect(init.method).toBe('GET');
  });

  it('maps FAILED to failed and QUEUED/unknown to pending', async () => {
    expect(await build(() => reply(true, { status: 'FAILED' })).provider.queryStatus(ref)).toMatchObject({
      state: 'failed',
    });
    expect(await build(() => reply(true, { status: 'QUEUED' })).provider.queryStatus(ref)).toMatchObject({
      state: 'pending',
    });
    expect(await build(() => reply(true, { status: 'WEIRD' })).provider.queryStatus(ref)).toMatchObject({
      state: 'pending',
    });
  });

  it('stays pending without a stored PayHero reference', async () => {
    const { provider, http } = build(() => reply(true, {}));
    await expect(provider.queryStatus({ ...ref, providerReference: null })).resolves.toMatchObject({
      state: 'pending',
    });
    expect(http).not.toHaveBeenCalled();
  });

  it('throws on HTTP errors so the job retries', async () => {
    await expect(build(() => reply(false, { message: 'down' }, 503)).provider.queryStatus(ref)).rejects.toThrow(
      /HTTP 503/,
    );
  });
});

describe('PayHeroMpesaProvider.parseCallback', () => {
  const { provider } = build(() => reply(true, {}));

  it('reads the nested M-Pesa style shape and never trusts it', () => {
    const parsed = provider.parseCallback({
      status: true,
      response: {
        Amount: 167,
        CheckoutRequestID: 'ws_CO_1',
        ExternalReference: 'NTM-ABC',
        MpesaReceiptNumber: 'SAE3YULR0Y',
        ResultCode: 0,
        ResultDesc: 'The service request is processed successfully.',
        Status: 'Success',
      },
    });
    expect(parsed).toMatchObject({
      reference: 'NTM-ABC',
      checkoutRequestId: 'ws_CO_1',
      claimed: { state: 'success', resultCode: 0, receiptNumber: 'SAE3YULR0Y' },
      trusted: false,
    });
  });

  it('reads a flat snake_case shape', () => {
    expect(
      provider.parseCallback({ external_reference: 'NTM-ABC', reference: 'PH-1', status: 'FAILED' }),
    ).toMatchObject({ reference: 'NTM-ABC', providerReference: 'PH-1', claimed: { state: 'failed' } });
  });

  it('returns null without any identifier', () => {
    expect(provider.parseCallback({ status: 'SUCCESS' })).toBeNull();
    expect(provider.parseCallback('nope')).toBeNull();
  });
});

describe('payHeroConfigFrom / payHeroState', () => {
  const config = (values: Record<string, unknown>) =>
    ({ get: (key: string) => values[key.replace('payments.payhero.', '')] ?? null }) as never;

  it('needs token, channel id and callback URL', () => {
    expect(payHeroConfigFrom(config({ ...cfg, authToken: null }))).toBeNull();
    expect(payHeroConfigFrom(config({ ...cfg, channelId: 'abc' }))).toBeNull();
    expect(payHeroConfigFrom(config({ ...cfg, baseUrl: 'https://x/api/v2/' }))).toMatchObject({
      baseUrl: 'https://x/api/v2',
      channelId: 911,
    });
  });

  it('uses ResultCode only when there is no status', () => {
    expect(payHeroState(null, 0)).toBe('success');
    expect(payHeroState(null, 1032)).toBe('failed');
    expect(payHeroState(null, null)).toBe('pending');
  });
});
