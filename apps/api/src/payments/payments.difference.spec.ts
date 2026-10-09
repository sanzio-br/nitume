import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../common/api-error';
import {
  ErrandStatus,
  PaymentFlow,
  PaymentStatus,
  PaymentTransactionStatus,
  PaymentTypeCode,
  UserRole,
} from '../common/enums';
import { MerchantRoute } from './payment-views';
import { PaymentsService } from './payments.service';
import { ConsoleMpesaProvider } from './providers/console.provider';

/** Price-change differences (rows 44, 48) and the callback path for them. */
const build = (opts: {
  primaryFlow?: PaymentFlow | null;
  merchant?: Record<string, string | null>;
  latestDifference?: object | null;
  stored?: object | null;
}) => {
  const saved: object[] = [];
  const payments = {
    findOne: vi.fn(({ where }: { where: Record<string, unknown> }) => {
      if ('id' in where) {
        return Promise.resolve(opts.stored ?? null);
      }
      if (typeof where.priceChangeRequestId === 'string') {
        return Promise.resolve(opts.latestDifference ?? null);
      }
      return Promise.resolve(
        opts.primaryFlow ? { id: 'p-main', paymentFlow: opts.primaryFlow } : null,
      );
    }),
    find: vi.fn(() => Promise.resolve([])),
    create: vi.fn((row: object) => row),
    save: vi.fn((row: object) => {
      const out = { id: `p-${saved.length + 1}`, createdAt: new Date(), ...row };
      saved.push(out);
      return Promise.resolve(out);
    }),
    update: vi.fn(() => Promise.resolve({})),
    manager: {} as { transaction: (fn: (m: unknown) => Promise<unknown>) => Promise<unknown> },
  };
  const transactions = {
    find: vi.fn(() =>
      Promise.resolve([{ id: 't-1', paymentId: 'p-1', mpesaReference: 'NTM-DIFF', rawCallback: null, status: PaymentTransactionStatus.INITIATED }]),
    ),
    create: vi.fn((row: object) => row),
    save: vi.fn((rows: object) => Promise.resolve(rows)),
    merge: vi.fn((row: object, patch: object) => Object.assign(row, patch)),
  };
  const manager = {
    getRepository: (entity: { name: string }) =>
      entity.name === 'Payment' ? payments : transactions,
  };
  payments.manager.transaction = vi.fn((fn) => fn(manager));
  const paymentTypes = {
    findOne: vi.fn(({ where }: { where: { code: PaymentTypeCode } }) =>
      Promise.resolve({ id: `type-${where.code}` }),
    ),
  };
  const customers = {
    findOne: vi.fn(() => Promise.resolve({ id: 'cust-1', userId: 'u-1' })),
  };
  const errands = {
    getById: vi.fn(() =>
      Promise.resolve({
        id: 'e-1',
        reference: 'NT-10001',
        customerId: 'cust-1',
        status: ErrandStatus.IN_PROGRESS,
        ...opts.merchant,
      }),
    ),
    transition: vi.fn(() => Promise.resolve({})),
  };
  // Real console provider (trusted mock callbacks) with the push stubbed.
  const stk = Object.assign(new ConsoleMpesaProvider(), {
    initiateStk: vi.fn(() => Promise.resolve({ checkoutRequestId: 'chk-d', transactionId: 't' })),
  });
  const config = { get: vi.fn((_k: string, d: unknown) => d) };
  const accounts = { listPaymentMethods: vi.fn(() => Promise.resolve([])) };
  const redis = { setIfAbsent: vi.fn(() => Promise.resolve(true)) };
  const users = { findById: vi.fn(() => Promise.resolve({ id: 'u-1', phone: '+254700000009' })) };
  const refunds = { openWithin: vi.fn(), openIfPaid: vi.fn() };
  const service = new PaymentsService(
    payments as never,
    transactions as never,
    paymentTypes as never,
    customers as never,
    errands as never,
    stk as never,
    config as never,
    accounts as never,
    refunds as never,
    users as never,
    redis as never,
  );
  return { service, payments, transactions, stk, errands, saved };
};

const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => (e instanceof ApiError ? e.code : String(e)),
  );

describe('PaymentsService.recordPriceDifference (rows 44, 48)', () => {
  it('records a send_to_runner increase as an STK charge leg to Nitume', async () => {
    const { service, transactions } = build({ primaryFlow: PaymentFlow.CUSTOMER_TO_RUNNER });
    const res = await service.recordPriceDifference('e-1', 'pc-1', 150);
    expect(res.payment).toMatchObject({
      paymentFlow: PaymentFlow.CUSTOMER_TO_RUNNER,
      merchantAmount: '150.00',
      serviceFee: '0.00',
      runnerFee: '0.00',
      priceChangeRequestId: 'pc-1',
    });
    expect(transactions.save).toHaveBeenCalledWith(
      expect.objectContaining({ paymentTypeId: 'type-merchant_payment', amount: '150.00' }),
    );
    expect(res.merchantPayment).toEqual({ route: 'send_to_runner', amount: '150.00', paidTo: 'nitume' });
  });

  it('keeps the original route even when another one is passed', async () => {
    const { service } = build({ primaryFlow: PaymentFlow.CUSTOMER_TO_RUNNER });
    const res = await service.recordPriceDifference('e-1', 'pc-1', 150, MerchantRoute.MERCHANT_DIRECT);
    expect(res.payment.paymentFlow).toBe(PaymentFlow.CUSTOMER_TO_RUNNER);
  });

  it('records a merchant_direct increase with the Till/Paybill and no STK leg', async () => {
    const { service, transactions } = build({
      primaryFlow: PaymentFlow.MERCHANT_DIRECT,
      merchant: { merchantName: 'Naivas', merchantTillNumber: '123456' },
    });
    const res = await service.recordPriceDifference('e-1', 'pc-1', 150);
    expect(res.payment.paymentFlow).toBe(PaymentFlow.MERCHANT_DIRECT);
    expect(transactions.save).not.toHaveBeenCalled();
    expect(res.merchantPayment).toMatchObject({ paidTo: 'merchant', tillNumber: '123456' });
  });

  it('requires an explicit route when merchant_direct details are gone', async () => {
    const { service } = build({ primaryFlow: PaymentFlow.MERCHANT_DIRECT });
    expect(await codeOf(service.recordPriceDifference('e-1', 'pc-1', 150))).toBe(
      'merchant_route_required',
    );
    const chosen = await service.recordPriceDifference('e-1', 'pc-1', 150, MerchantRoute.SEND_TO_RUNNER);
    expect(chosen.payment.paymentFlow).toBe(PaymentFlow.CUSTOMER_TO_RUNNER);
  });

  it('requires an explicit route when the task had no merchant amount', async () => {
    const { service } = build({ primaryFlow: PaymentFlow.PLATFORM_ONLY });
    expect(await codeOf(service.recordPriceDifference('e-1', 'pc-1', 150))).toBe(
      'merchant_route_required',
    );
  });
});

describe('PaymentsService.primaryRouteFor (row 86)', () => {
  it('maps the primary payment flow to its merchant route', async () => {
    expect(
      await build({ primaryFlow: PaymentFlow.CUSTOMER_TO_RUNNER }).service.primaryRouteFor('e-1'),
    ).toBe(MerchantRoute.SEND_TO_RUNNER);
    expect(
      await build({ primaryFlow: PaymentFlow.MERCHANT_DIRECT }).service.primaryRouteFor('e-1'),
    ).toBe(MerchantRoute.MERCHANT_DIRECT);
  });

  it('is null without a primary payment or merchant amount', async () => {
    expect(await build({ primaryFlow: null }).service.primaryRouteFor('e-1')).toBeNull();
    expect(
      await build({ primaryFlow: PaymentFlow.PLATFORM_ONLY }).service.primaryRouteFor('e-1'),
    ).toBeNull();
  });
});

describe('PaymentsService.chargeDifference / retryDifference', () => {
  const stkDifference = {
    id: 'p-1',
    errandId: 'e-1',
    priceChangeRequestId: 'pc-1',
    paymentFlow: PaymentFlow.CUSTOMER_TO_RUNNER,
    merchantAmount: '150.00',
    status: PaymentStatus.PENDING,
    createdAt: new Date(),
  };

  it('pushes the difference to the errand owner phone with the leg reference', async () => {
    const { service, stk } = build({ stored: stkDifference });
    const view = await service.chargeDifference('p-1');
    expect(stk.initiateStk).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+254700000009', amountKes: '150.00', reference: 'NTM-DIFF' }),
    );
    expect(view).toMatchObject({ stkStatus: 'PENDING', checkoutRequestId: 'chk-d' });
  });

  it('never pushes for a merchant_direct difference', async () => {
    const { service, stk } = build({
      stored: { ...stkDifference, paymentFlow: PaymentFlow.MERCHANT_DIRECT },
      merchant: { merchantName: 'Naivas', merchantTillNumber: '123456' },
    });
    const view = await service.chargeDifference('p-1');
    expect(stk.initiateStk).not.toHaveBeenCalled();
    expect(view.stkStatus).toBeNull();
  });

  const owner = { userId: 'u-1', role: UserRole.CUSTOMER, phone: '+254700000009', status: 'active' };

  it('retries only a FAILED difference, with a new payment row', async () => {
    const failed = build({
      latestDifference: { ...stkDifference, status: PaymentStatus.FAILED },
      stored: { ...stkDifference, id: 'p-1' },
    });
    await failed.service.retryDifference('e-1', 'pc-1', owner);
    expect(failed.saved).toHaveLength(1);
    expect(failed.stk.initiateStk).toHaveBeenCalledTimes(1);

    const pending = build({ latestDifference: stkDifference });
    await pending.service.retryDifference('e-1', 'pc-1', owner);
    expect(pending.stk.initiateStk).not.toHaveBeenCalled();
  });

  it('refuses a retry for a merchant_direct difference', async () => {
    const { service } = build({
      latestDifference: { ...stkDifference, paymentFlow: PaymentFlow.MERCHANT_DIRECT, status: PaymentStatus.FAILED },
    });
    expect(await codeOf(service.retryDifference('e-1', 'pc-1', owner))).toBe('difference_not_stk');
  });
});

describe('PaymentsService.handleCallback for a difference', () => {
  it('records the result without moving the errand', async () => {
    const { service, errands, payments } = build({
      stored: {
        id: 'p-1',
        errandId: 'e-1',
        priceChangeRequestId: 'pc-1',
        paymentFlow: PaymentFlow.CUSTOMER_TO_RUNNER,
        status: PaymentStatus.PENDING,
      },
    });
    await service.handleCallback({ reference: 'NTM-DIFF', resultCode: 0 });
    expect(payments.update).toHaveBeenCalledWith('p-1', { status: PaymentStatus.COMPLETED });
    expect(errands.transition).not.toHaveBeenCalled();
  });
});
