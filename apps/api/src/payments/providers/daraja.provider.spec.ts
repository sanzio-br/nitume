import { describe, expect, it, vi } from 'vitest';
import { DarajaMpesaProvider, darajaConfigFrom, darajaTimestamp } from './daraja.provider';

const cfg = {
  baseUrl: 'https://daraja.test',
  consumerKey: 'key',
  consumerSecret: 'secret',
  shortCode: '174379',
  passkey: 'pass',
  callbackUrl: 'https://api.test/api/v1/payments/mpesa/callback',
};

const ref = (checkoutRequestId: string) => ({
  reference: 'NTM-1',
  checkoutRequestId,
  providerReference: null,
});

const reply = (ok: boolean, json: unknown, status = ok ? 200 : 500) =>
  Promise.resolve({ ok, status, json: () => Promise.resolve(json) });

const build = (queryReply: () => ReturnType<typeof reply>) => {
  const http = vi.fn((url: string) =>
    url.includes('/oauth/') ? reply(true, { access_token: 'tok', expires_in: '3599' }) : queryReply(),
  );
  return { gateway: new DarajaMpesaProvider(cfg, http), http };
};

describe('DarajaMpesaProvider.queryStatus (row 52)', () => {
  it('maps ResultCode 0 to success and sends the query with the bearer token', async () => {
    const { gateway, http } = build(() => reply(true, { ResponseCode: '0', ResultCode: '0', ResultDesc: 'ok' }));
    await expect(gateway.queryStatus(ref('ws_CO_1'))).resolves.toEqual({
      state: 'success',
      resultCode: 0,
      resultDesc: 'ok',
    });
    const [url, init] = http.mock.calls[1] as unknown as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe('https://daraja.test/mpesa/stkpushquery/v1/query');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toMatchObject({ BusinessShortCode: '174379', CheckoutRequestID: 'ws_CO_1' });
  });

  it('maps a non-zero ResultCode (e.g. 1032 cancelled) to failed with the reason', async () => {
    const { gateway } = build(() =>
      reply(true, { ResponseCode: '0', ResultCode: '1032', ResultDesc: 'Request cancelled by user' }),
    );
    await expect(gateway.queryStatus(ref('ws_CO_1'))).resolves.toEqual({
      state: 'failed',
      resultCode: 1032,
      resultDesc: 'Request cancelled by user',
    });
  });

  it('treats "still being processed" as pending', async () => {
    const { gateway } = build(() =>
      reply(false, { errorCode: '500.001.1001', errorMessage: 'The transaction is being processed' }),
    );
    await expect(gateway.queryStatus(ref('ws_CO_1'))).resolves.toMatchObject({ state: 'pending' });
  });

  it('throws on other provider errors', async () => {
    const { gateway } = build(() => reply(false, { errorCode: '400.002.02', errorMessage: 'Bad Request' }));
    await expect(gateway.queryStatus(ref('ws_CO_1'))).rejects.toThrow(/Bad Request/);
  });

  it('caches the OAuth token between calls', async () => {
    const { gateway, http } = build(() => reply(true, { ResultCode: '0' }));
    await gateway.queryStatus(ref('a'));
    await gateway.queryStatus(ref('b'));
    expect(http.mock.calls.filter(([url]) => String(url).includes('/oauth/'))).toHaveLength(1);
  });
});

describe('DarajaMpesaProvider.initiateStk', () => {
  it('posts Lipa Na M-Pesa Online and returns the checkout ids', async () => {
    const { gateway, http } = build(() =>
      reply(true, { ResponseCode: '0', CheckoutRequestID: 'ws_CO_9', MerchantRequestID: 'm-9' }),
    );
    const out = await gateway.initiateStk({
      phone: '+254712345678',
      amountKes: '3000.00',
      reference: 'NTM-ABC',
      description: 'Nitume errand',
    });
    expect(out).toEqual({ checkoutRequestId: 'ws_CO_9', merchantRequestId: 'm-9', transactionId: 'ws_CO_9' });
    const body = JSON.parse((http.mock.calls[1] as unknown as [string, { body: string }])[1].body);
    expect(body).toMatchObject({ Amount: 3000, PartyA: '254712345678', AccountReference: 'NTM-ABC' });
  });
});

describe('DarajaMpesaProvider callbacks (row 73)', () => {
  it('does not parse Daraja callbacks (future provider)', () => {
    const { gateway } = build(() => reply(true, {}));
    expect(gateway.parseCallback({ Body: { stkCallback: { ResultCode: 0 } } })).toBeNull();
  });

  it('stays pending without a stored checkout id', async () => {
    const { gateway, http } = build(() => reply(true, {}));
    await expect(
      gateway.queryStatus({ reference: 'NTM-1', checkoutRequestId: null, providerReference: null }),
    ).resolves.toMatchObject({ state: 'pending' });
    expect(http).not.toHaveBeenCalled();
  });
});

describe('darajaConfigFrom / darajaTimestamp', () => {
  it('needs every credential', () => {
    const config = (values: Record<string, string | null>) =>
      ({ get: (key: string) => values[key.replace('payments.daraja.', '')] ?? null }) as never;
    expect(darajaConfigFrom(config({ ...cfg, passkey: null }))).toBeNull();
    expect(darajaConfigFrom(config(cfg))).toMatchObject({ shortCode: '174379' });
  });

  it('formats the Daraja timestamp in Kenya time', () => {
    expect(darajaTimestamp(new Date('2026-10-08T09:05:07Z'))).toBe('20261008120507');
  });
});
