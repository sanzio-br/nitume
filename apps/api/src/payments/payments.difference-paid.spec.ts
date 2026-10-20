import { describe, expect, it, vi } from 'vitest';
import { ErrandStatus, PaymentFlow, PaymentStatus, PaymentTransactionStatus } from '../common/enums';
import { PRICE_DIFFERENCE_PAID_EVENT } from './payment-events';
import { PaymentsService } from './payments.service';

/** Row 248: approved send_to_runner increases not yet paid, and the paid event. */
const build = (opts: { rows?: unknown[]; flow?: PaymentFlow; status?: ErrandStatus } = {}) => {
  const payment = {
    id: 'p-9',
    errandId: 'e-1',
    priceChangeRequestId: 'pc-1',
    paymentFlow: opts.flow ?? PaymentFlow.CUSTOMER_TO_RUNNER,
    merchantAmount: '200.00',
    status: PaymentStatus.PENDING,
    createdAt: new Date(),
  };
  const legs = [
    {
      id: 't-9',
      paymentId: 'p-9',
      mpesaReference: 'NTM-DIF',
      status: PaymentTransactionStatus.INITIATED,
      rawCallback: { stkPush: { checkoutRequestId: 'ws_CO_9', providerReference: 'PH-9' } },
    },
  ];
  const payments = {
    findOne: vi.fn(() => Promise.resolve(payment)),
    find: vi.fn(() => Promise.resolve(opts.rows ?? [])),
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
    getById: vi.fn(() => Promise.resolve({ id: 'e-1', status: opts.status ?? ErrandStatus.IN_PROGRESS })),
    transition: vi.fn(() => Promise.resolve({})),
  };
  const provider = {
    name: 'test',
    queryStatus: vi.fn(() => Promise.resolve({ state: 'success', resultCode: 0, receiptNumber: 'R1' })),
  };
  const emit = vi.fn();
  const service = new PaymentsService(
    payments as never,
    transactions as never,
    {} as never,
    {} as never,
    errands as never,
    provider as never,
    { get: vi.fn((_k: string, d: unknown) => d) } as never,
    {} as never,
    { openWithin: vi.fn(() => Promise.resolve(null)) } as never,
    {} as never,
    {} as never,
    undefined,
    { emit } as never,
  );
  return { service, payments, emit, errands };
};

const row = (requestId: string, status: PaymentStatus, amount: string, at: number) => ({
  id: `${requestId}-${at}`,
  priceChangeRequestId: requestId,
  status,
  merchantAmount: amount,
  createdAt: new Date(at),
});

describe('PaymentsService.unpaidDifferences (row 248)', () => {
  it('lists each send_to_runner difference with no completed or refunded payment, newest row first', async () => {
    const { service, payments } = build({
      rows: [
        row('pc-3', PaymentStatus.FAILED, '75.00', 5),
        row('pc-2', PaymentStatus.COMPLETED, '50.00', 4),
        row('pc-1', PaymentStatus.PENDING, '200.00', 3),
        row('pc-3', PaymentStatus.FAILED, '75.00', 2),
        row('pc-4', PaymentStatus.REFUNDED, '10.00', 1),
      ],
    });
    await expect(service.unpaidDifferences('e-1')).resolves.toEqual([
      { priceChangeRequestId: 'pc-3', amount: '75.00', status: PaymentStatus.FAILED },
      { priceChangeRequestId: 'pc-1', amount: '200.00', status: PaymentStatus.PENDING },
    ]);
    expect(payments.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ errandId: 'e-1', paymentFlow: PaymentFlow.CUSTOMER_TO_RUNNER }) }),
    );
  });
});

describe('price_change.difference_paid (row 248)', () => {
  it('is emitted once a send_to_runner difference payment completes; the errand does not move', async () => {
    const { service, emit, errands } = build();
    await expect(service.verifyPayment('p-9')).resolves.toBe('success');
    await new Promise((r) => setImmediate(r));
    expect(emit).toHaveBeenCalledWith(PRICE_DIFFERENCE_PAID_EVENT, {
      errandId: 'e-1',
      requestId: 'pc-1',
      amount: '200.00',
      paidAt: expect.any(String),
    });
    expect(errands.transition).not.toHaveBeenCalled();
  });

  it('is not emitted for a merchant_direct difference', async () => {
    const { service, emit } = build({ flow: PaymentFlow.MERCHANT_DIRECT });
    await service.verifyPayment('p-9');
    await new Promise((r) => setImmediate(r));
    expect(emit).not.toHaveBeenCalled();
  });
});
