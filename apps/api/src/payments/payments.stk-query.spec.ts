import { describe, expect, it, vi } from 'vitest';
import { ErrandStatus, PaymentStatus, PaymentTransactionStatus } from '../common/enums';
import { StkStatus } from './payment-views';
import { PaymentsService } from './payments.service';

/** STK Query resolution of TIMEOUT payments (row 52). */
const build = (opts: {
  ageSeconds: number;
  query?: { state: 'success' | 'failed' | 'pending'; resultCode: number | null; resultDesc: string | null };
  slot?: boolean;
  checkout?: string | null;
}) => {
  const payment = {
    id: 'p-1',
    errandId: 'e-1',
    priceChangeRequestId: null,
    status: PaymentStatus.PENDING,
    createdAt: new Date(Date.now() - opts.ageSeconds * 1000),
  };
  const legs = [
    {
      id: 't-1',
      paymentId: 'p-1',
      mpesaReference: 'NTM-1',
      status: PaymentTransactionStatus.INITIATED,
      rawCallback:
        opts.checkout === null ? null : { stkPush: { checkoutRequestId: opts.checkout ?? 'ws_CO_1' } },
    },
  ];
  const payments = {
    findOne: vi.fn(() => Promise.resolve(payment)),
    find: vi.fn(() => Promise.resolve([payment])),
    manager: {
      transaction: vi.fn((fn: (m: unknown) => Promise<unknown>) =>
        fn({
          getRepository: (e: { name: string }) =>
            e.name === 'Payment'
              ? {
                  update: vi.fn((_id: string, patch: { status: PaymentStatus }) => {
                    payment.status = patch.status;
                    return Promise.resolve({});
                  }),
                }
              : { save: vi.fn((r: unknown) => Promise.resolve(r)), merge: (r: object, p: object) => Object.assign(r, p) },
        }),
      ),
    },
  };
  const transactions = { find: vi.fn(() => Promise.resolve(legs)) };
  const errands = {
    getById: vi.fn(() => Promise.resolve({ id: 'e-1', status: ErrandStatus.ACCEPTED })),
    transition: vi.fn(() => Promise.resolve({})),
  };
  const stk = {
    name: 'daraja',
    queryStatus: vi.fn(() => Promise.resolve(opts.query ?? { state: 'pending', resultCode: null, resultDesc: null })),
  };
  const config = { get: vi.fn((_k: string, d: unknown) => d) };
  const redis = { setIfAbsent: vi.fn(() => Promise.resolve(opts.slot ?? true)) };
  const service = new PaymentsService(
    payments as never,
    transactions as never,
    {} as never,
    {} as never,
    errands as never,
    stk as never,
    config as never,
    {} as never,
    { openWithin: vi.fn(), openIfPaid: vi.fn() } as never,
    {} as never,
    redis as never,
  );
  return { service, payment, stk, errands, redis, legs };
};

describe('PaymentsService.resolvePending (row 52)', () => {
  it('does not query before the STK timeout', async () => {
    const { service, stk } = build({ ageSeconds: 10 });
    await expect(service.resolvePending('p-1')).resolves.toBe(StkStatus.PENDING);
    expect(stk.queryStatus).not.toHaveBeenCalled();
  });

  it('applies a provider success like a callback and confirms the errand', async () => {
    const { service, stk, errands, payment, legs } = build({
      ageSeconds: 200,
      query: { state: 'success', resultCode: 0, resultDesc: 'ok' },
    });
    await expect(service.resolvePending('p-1')).resolves.toBe(StkStatus.SUCCESS);
    expect(stk.queryStatus).toHaveBeenCalledWith({ reference: 'NTM-1', checkoutRequestId: 'ws_CO_1', providerReference: null });
    expect(payment.status).toBe(PaymentStatus.COMPLETED);
    expect(legs[0].status).toBe(PaymentTransactionStatus.COMPLETED);
    // The push ids stay next to the provider result.
    expect(legs[0].rawCallback).toMatchObject({ stkPush: { checkoutRequestId: 'ws_CO_1' }, resultCode: 0 });
    expect(errands.transition).toHaveBeenCalledWith(
      'e-1',
      ErrandStatus.PAYMENT_CONFIRMED,
      expect.anything(),
      expect.any(String),
    );
  });

  it('marks a provider failure FAILED with its reason', async () => {
    const { service, payment, legs } = build({
      ageSeconds: 200,
      query: { state: 'failed', resultCode: 1032, resultDesc: 'Request cancelled by user' },
    });
    await expect(service.resolvePending('p-1')).resolves.toBe(StkStatus.FAILED);
    expect(payment.status).toBe(PaymentStatus.FAILED);
    expect(legs[0].rawCallback).toMatchObject({ resultCode: 1032, resultDesc: 'Request cancelled by user' });
  });

  it('stays TIMEOUT while the provider is still processing', async () => {
    const { service, payment } = build({ ageSeconds: 200 });
    await expect(service.resolvePending('p-1')).resolves.toBe(StkStatus.TIMEOUT);
    expect(payment.status).toBe(PaymentStatus.PENDING);
  });

  it('spaces queries for the same payment', async () => {
    const { service, stk } = build({ ageSeconds: 200, slot: false });
    await expect(service.resolvePending('p-1')).resolves.toBe(StkStatus.TIMEOUT);
    expect(stk.queryStatus).not.toHaveBeenCalled();
  });

  it('cannot query a push without a checkout id', async () => {
    const { service, stk } = build({ ageSeconds: 200, checkout: null });
    await expect(service.resolvePending('p-1')).resolves.toBe(StkStatus.TIMEOUT);
    expect(stk.queryStatus).not.toHaveBeenCalled();
  });

  it('resolveTimedOut counts payments that reached a final status', async () => {
    const { service } = build({ ageSeconds: 200, query: { state: 'success', resultCode: 0, resultDesc: null } });
    await expect(service.resolveTimedOut()).resolves.toBe(1);
  });
});
