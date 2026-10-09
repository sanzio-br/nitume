import { describe, expect, it, vi } from 'vitest';
import { ErrandStatus, PaymentStatus, PaymentTransactionStatus } from '../common/enums';
import { PAYMENT_VERIFY_JOB } from '../infra/queue/queues';
import { PaymentsService } from './payments.service';
import { PayHeroMpesaProvider } from './providers/payhero.provider';

/** Provider callbacks are verified by a status query before money moves (row 73). */
const build = (query: { state: 'success' | 'failed' | 'pending' } = { state: 'success' }) => {
  const payment = {
    id: 'p-1',
    errandId: 'e-1',
    priceChangeRequestId: null,
    status: PaymentStatus.PENDING,
    createdAt: new Date(),
  };
  const legs = [
    {
      id: 't-1',
      paymentId: 'p-1',
      mpesaReference: 'NTM-ABC',
      status: PaymentTransactionStatus.INITIATED,
      rawCallback: { stkPush: { checkoutRequestId: 'ws_CO_1', providerReference: 'PH-REF-1' } },
    },
  ];
  const payments = {
    findOne: vi.fn(() => Promise.resolve(payment)),
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
              : {
                  save: vi.fn((r: unknown) => Promise.resolve(r)),
                  merge: (r: object, p: object) => Object.assign(r, p),
                },
        }),
      ),
    },
  };
  const qb = {
    where: vi.fn(() => qb),
    orWhere: vi.fn(() => qb),
    getOne: vi.fn(() => Promise.resolve(legs[0])),
  };
  const transactions = {
    find: vi.fn(({ where }: { where: { mpesaReference?: string; paymentId?: string } }) =>
      Promise.resolve(where.mpesaReference && where.mpesaReference !== 'NTM-ABC' ? [] : legs),
    ),
    createQueryBuilder: vi.fn(() => qb),
  };
  const errands = {
    getById: vi.fn(() => Promise.resolve({ id: 'e-1', status: ErrandStatus.ACCEPTED })),
    transition: vi.fn(() => Promise.resolve({})),
  };
  const http = vi.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          status: query.state === 'success' ? 'SUCCESS' : query.state === 'failed' ? 'FAILED' : 'QUEUED',
          third_party_reference: 'SAE3YULR0Y',
        }),
    }),
  );
  const provider = new PayHeroMpesaProvider(
    { baseUrl: 'https://payhero.test', authToken: 't', channelId: 1, callbackUrl: 'cb', timeoutMs: 1000 },
    http,
  );
  const queue = { add: vi.fn(() => Promise.resolve({})) };
  const service = new PaymentsService(
    payments as never,
    transactions as never,
    {} as never,
    {} as never,
    errands as never,
    provider,
    { get: vi.fn((_k: string, d: unknown) => d) } as never,
    {} as never,
    { openWithin: vi.fn(), openIfPaid: vi.fn() } as never,
    {} as never,
    { setIfAbsent: vi.fn(() => Promise.resolve(true)) } as never,
    queue as never,
  );
  return { service, payment, legs, queue, http, errands, qb };
};

const successCallback = {
  response: { ExternalReference: 'NTM-ABC', CheckoutRequestID: 'ws_CO_1', ResultCode: 0, Status: 'Success' },
};

describe('PaymentsService.handleCallback with PayHero (row 73)', () => {
  it('does not mark anything paid from the callback; it queues a verification', async () => {
    const { service, payment, queue, http } = build();
    await service.handleCallback(successCallback);
    expect(payment.status).toBe(PaymentStatus.PENDING);
    expect(http).not.toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledWith(PAYMENT_VERIFY_JOB, { paymentId: 'p-1', claimed: 'success' });
  });

  it('finds the payment by the provider ids when the external reference is missing', async () => {
    const { service, queue, qb } = build();
    await service.handleCallback({ response: { CheckoutRequestID: 'ws_CO_1', ResultCode: 0 } });
    expect(qb.getOne).toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledWith(PAYMENT_VERIFY_JOB, expect.objectContaining({ paymentId: 'p-1' }));
  });

  it('400 callback_unrecognised for a body without identifiers', async () => {
    const { service } = build();
    await expect(service.handleCallback({ hello: 'world' })).rejects.toMatchObject({
      code: 'callback_unrecognised',
    });
  });

  it('a spoofed success never confirms the payment when the provider says FAILED', async () => {
    const { service, payment, errands } = build({ state: 'failed' });
    await service.handleCallback(successCallback);
    await expect(service.verifyPayment('p-1')).resolves.toBe('failed');
    expect(payment.status).toBe(PaymentStatus.FAILED);
    expect(errands.transition).not.toHaveBeenCalled();
  });

  it('verifyPayment applies a confirmed success, stores the receipt and confirms the errand', async () => {
    const { service, payment, legs, errands, http } = build({ state: 'success' });
    await expect(service.verifyPayment('p-1')).resolves.toBe('success');
    expect(http).toHaveBeenCalledWith(
      'https://payhero.test/transaction-status?reference=PH-REF-1',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(payment.status).toBe(PaymentStatus.COMPLETED);
    expect(legs[0].rawCallback).toMatchObject({
      resultCode: 0,
      receiptNumber: 'SAE3YULR0Y',
      provider: 'payhero',
      source: 'query',
    });
    expect(errands.transition).toHaveBeenCalledWith(
      'e-1',
      ErrandStatus.PAYMENT_CONFIRMED,
      expect.anything(),
      expect.any(String),
    );
  });

  it('verifyPayment leaves a still-queued payment pending', async () => {
    const { service, payment } = build({ state: 'pending' });
    await expect(service.verifyPayment('p-1')).resolves.toBe('pending');
    expect(payment.status).toBe(PaymentStatus.PENDING);
  });
});
