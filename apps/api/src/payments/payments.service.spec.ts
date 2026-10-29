import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../common/api-error';
import {
  ErrandStatus,
  PaymentFlow,
  PaymentMethodType,
  PaymentStatus,
  PaymentTypeCode,
  UserRole,
} from '../common/enums';
import { MerchantRoute, StkStatus, stkStatusOf } from './payment-views';
import { PaymentsService } from './payments.service';

const user = { userId: 'u-1', role: UserRole.CUSTOMER, phone: '+254700000001' } as never;

const build = (opts: {
  budget?: string;
  keyed?: object | null;
  existing?: object | null;
  /** Row returned for the active-primary lookup after a unique violation. */
  active?: object | null;
  /** Make the payment insert fail with a unique violation (lost a race). */
  conflict?: boolean;
  methods?: object[];
  /** Newest quote has expired (row 46). */
  quoteExpired?: boolean;
  /** Newest quote is an admin re-quote the customer has not accepted (row 72). */
  quoteNotAccepted?: boolean;
  /** Merchant Till/Paybill columns on the errand (row 43). */
  merchant?: Record<string, string | null>;
  /** The errand's deadline (row 237). */
  deadlineAt?: Date | null;
  /** The errand's fee payment has completed (issue #28). */
  feesPaid?: boolean;
} = {}) => {
  const payments = {
    findOne: vi.fn(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(
        'idempotencyKey' in where
          ? (opts.keyed ?? null)
          : 'status' in where
            ? (opts.active ?? null)
            : (opts.existing ?? null),
      ),
    ),
    // Issue #28 fee-paid lookup: completed primary payments of the errands.
    find: vi.fn(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(where.status === PaymentStatus.COMPLETED && opts.feesPaid ? [{ errandId: 'e-1' }] : []),
    ),
    create: vi.fn((row: object) => row),
    save: vi.fn((row: object) =>
      opts.conflict
        ? Promise.reject(Object.assign(new Error('duplicate key'), { code: '23505' }))
        : Promise.resolve({ id: 'p-new', createdAt: new Date(), ...row }),
    ),
    manager: {} as { transaction: (fn: (m: unknown) => Promise<unknown>) => Promise<unknown> },
  };
  const transactions = {
    find: vi.fn(() => Promise.resolve([{ mpesaReference: 'NTM-OLD' }])),
    create: vi.fn((row: object) => row),
    save: vi.fn((rows: object[]) => Promise.resolve(rows)),
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
  const customers = { findOne: vi.fn(() => Promise.resolve({ id: 'cust-1' })) };
  const errands = {
    getById: vi.fn(() =>
      Promise.resolve({
        id: 'e-1',
        reference: 'NT-10001',
        customerId: 'cust-1',
        status: ErrandStatus.ACCEPTED,
        quotedPrice: '1000.00',
        budget: opts.budget ?? '0.00',
        category: 'buy_for_me',
        deadlineAt: opts.deadlineAt ?? null,
        ...opts.merchant,
      }),
    ),
    payableQuote: vi.fn(() =>
      opts.quoteExpired
        ? Promise.reject(new ApiError(409, 'quote_expired', 'expired'))
        : opts.quoteNotAccepted
          ? Promise.reject(new ApiError(409, 'quote_not_accepted', 'accept it'))
          : Promise.resolve({ id: 'q-1', total: '1000.00', acceptedAt: new Date() }),
    ),
    onRequote: vi.fn(),
    onFeesPaidLookup: vi.fn(),
  };
  const stk = { name: 'console', initiateStk: vi.fn(() => Promise.resolve({ checkoutRequestId: 'chk-1', transactionId: 't' })) };
  const config = { get: vi.fn((_k: string, d: unknown) => d) };
  const redis = { setIfAbsent: vi.fn(() => Promise.resolve(true)) };
  const users = { findById: vi.fn(() => Promise.resolve({ id: 'u-1', phone: '+254700000001' })) };
  const accounts = { listPaymentMethods: vi.fn(() => Promise.resolve(opts.methods ?? [])) };
  const service = new PaymentsService(
    payments as never,
    transactions as never,
    paymentTypes as never,
    customers as never,
    errands as never,
    stk as never,
    config as never,
    accounts as never,
    {} as never,
    users as never,
    redis as never,
  );
  return { service, payments, transactions, stk, errands };
};

const codeOf = async (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => (e instanceof ApiError ? e.code : String(e)),
  );

describe('stkStatusOf', () => {
  const now = new Date('2026-10-07T10:00:00Z');
  const at = (secondsAgo: number) => new Date(now.getTime() - secondsAgo * 1000);

  it('maps ledger status and age to PENDING / SUCCESS / FAILED / TIMEOUT', () => {
    expect(stkStatusOf({ status: PaymentStatus.PENDING, createdAt: at(10) }, 120, now)).toBe(
      StkStatus.PENDING,
    );
    expect(stkStatusOf({ status: PaymentStatus.PENDING, createdAt: at(120) }, 120, now)).toBe(
      StkStatus.TIMEOUT,
    );
    expect(stkStatusOf({ status: PaymentStatus.COMPLETED, createdAt: at(999) }, 120, now)).toBe(
      StkStatus.SUCCESS,
    );
    expect(stkStatusOf({ status: PaymentStatus.FAILED, createdAt: at(1) }, 120, now)).toBe(
      StkStatus.FAILED,
    );
  });
});

describe('PaymentsService.initiate after the deadline (row 237)', () => {
  it('refuses a new payment once the deadline has passed (409 deadline_passed_before_payment), without pushing', async () => {
    const deadlineAt = new Date(Date.now() - 60_000);
    const { service, stk } = build({ deadlineAt });
    const err = await service.initiate('e-1', user).catch((e: unknown) => e);
    expect((err as ApiError).getResponse()).toMatchObject({
      statusCode: 409,
      code: 'deadline_passed_before_payment',
      deadlineAt: deadlineAt.toISOString(),
    });
    expect(stk.initiateStk).not.toHaveBeenCalled();
  });

  it('still answers a payment already started before the deadline', async () => {
    const existing = { id: 'p-1', errandId: 'e-1', status: PaymentStatus.PENDING, createdAt: new Date(), paymentFlow: PaymentFlow.PLATFORM_ONLY };
    const { service, stk } = build({ deadlineAt: new Date(Date.now() - 60_000), keyed: existing });
    const res = await service.initiate('e-1', user, { idempotencyKey: 'key-12345678' });
    expect(res.payment).toBe(existing);
    expect(stk.initiateStk).not.toHaveBeenCalled();
  });

  it('never refuses a Flexible task: it has no deadline until payment (rows 235, 239)', async () => {
    const { service, stk } = build({ deadlineAt: null });
    await service.initiate('e-1', user);
    expect(stk.initiateStk).toHaveBeenCalledTimes(1);
  });

  it('pays normally while the deadline is ahead', async () => {
    const { service, stk } = build({ deadlineAt: new Date(Date.now() + 3_600_000) });
    await service.initiate('e-1', user);
    expect(stk.initiateStk).toHaveBeenCalledTimes(1);
  });
});

describe('PaymentsService.initiate', () => {
  it('returns the payment stored under the same Idempotency-Key without pushing', async () => {
    const keyed = { id: 'p-1', errandId: 'e-1', status: PaymentStatus.PENDING, createdAt: new Date(), paymentFlow: PaymentFlow.PLATFORM_ONLY };
    const { service, stk } = build({ keyed });
    const res = await service.initiate('e-1', user, { idempotencyKey: 'key-12345678' });
    expect(res.payment).toBe(keyed);
    expect(res.stkStatus).toBe(StkStatus.PENDING);
    expect(stk.initiateStk).not.toHaveBeenCalled();
  });

  it('refuses a key that belongs to another errand and malformed keys', async () => {
    const { service } = build({ keyed: { id: 'p-1', errandId: 'e-2' } });
    expect(await codeOf(service.initiate('e-1', user, { idempotencyKey: 'key-12345678' }))).toBe(
      'idempotency_key_reused',
    );
    expect(await codeOf(service.initiate('e-1', user, { idempotencyKey: 'short' }))).toBe(
      'idempotency_key_invalid',
    );
  });

  it('does not push again while a previous payment is pending (even TIMEOUT)', async () => {
    const existing = {
      id: 'p-1',
      errandId: 'e-1',
      status: PaymentStatus.PENDING,
      createdAt: new Date(Date.now() - 10 * 60_000),
      paymentFlow: PaymentFlow.PLATFORM_ONLY,
    };
    const { service, stk } = build({ existing });
    const res = await service.initiate('e-1', user, { idempotencyKey: 'another-key-1' });
    expect(res.stkStatus).toBe(StkStatus.TIMEOUT);
    expect(stk.initiateStk).not.toHaveBeenCalled();
  });

  it('pushes a fresh charge with the key after a FAILED payment', async () => {
    const existing = { id: 'p-0', errandId: 'e-1', status: PaymentStatus.FAILED, createdAt: new Date(), paymentFlow: PaymentFlow.PLATFORM_ONLY };
    const { service, stk, payments } = build({ existing });
    const res = await service.initiate('e-1', user, { idempotencyKey: 'retry-key-01' });
    expect(stk.initiateStk).toHaveBeenCalledTimes(1);
    expect(payments.create).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'retry-key-01', paymentFlow: PaymentFlow.PLATFORM_ONLY }),
    );
    expect(res.merchantPayment).toBeNull();
  });

  it('returns the winning payment when a concurrent keyless initiate loses the race', async () => {
    const active = {
      id: 'p-won',
      errandId: 'e-1',
      status: PaymentStatus.PENDING,
      createdAt: new Date(),
      paymentFlow: PaymentFlow.PLATFORM_ONLY,
    };
    const { service, stk, payments } = build({ conflict: true, active });
    const res = await service.initiate('e-1', user);
    expect(payments.manager.transaction).toHaveBeenCalledTimes(1);
    expect(res.payment).toBe(active);
    expect(stk.initiateStk).not.toHaveBeenCalled();
  });

  it('returns the winning payment when a concurrent initiate used a different key', async () => {
    const active = {
      id: 'p-won',
      errandId: 'e-1',
      status: PaymentStatus.PENDING,
      createdAt: new Date(),
      paymentFlow: PaymentFlow.PLATFORM_ONLY,
    };
    // Our key is unused (keyed: null), the errand's active-payment index fired.
    const { service, stk } = build({ conflict: true, active, keyed: null });
    const res = await service.initiate('e-1', user, { idempotencyKey: 'other-key-002' });
    expect(res.payment).toBe(active);
    expect(stk.initiateStk).not.toHaveBeenCalled();
  });

  it('rethrows a unique violation when no winning payment is found', async () => {
    const { service, stk } = build({ conflict: true });
    expect(await codeOf(service.initiate('e-1', user))).toMatch(/duplicate key/);
    expect(stk.initiateStk).not.toHaveBeenCalled();
  });

  it('writes the payment and its two legs in one transaction before pushing', async () => {
    const { service, payments, transactions, stk } = build();
    await service.initiate('e-1', user);
    expect(payments.manager.transaction).toHaveBeenCalledTimes(1);
    expect(transactions.save).toHaveBeenCalledWith([
      expect.objectContaining({ paymentId: 'p-new', paymentTypeId: 'type-service_fee' }),
      expect.objectContaining({ paymentId: 'p-new', paymentTypeId: 'type-runner_fee' }),
    ]);
    expect(stk.initiateStk).toHaveBeenCalledTimes(1);
  });

  it('requires a merchant route when there is a merchant amount', async () => {
    const { service } = build({ budget: '2500.00' });
    expect(await codeOf(service.initiate('e-1', user))).toBe('merchant_route_required');
  });

  it('never charges a merchant amount outside Buy For Me / Get It For Me (row 80)', async () => {
    const { service, payments } = build({
      budget: '2500.00',
      merchant: { category: 'inspection' } as never,
    });
    await service.initiate('e-1', user);
    expect(payments.create).toHaveBeenCalledWith(
      expect.objectContaining({ paymentFlow: PaymentFlow.PLATFORM_ONLY, merchantAmount: '0.00' }),
    );
  });

  it('refuses merchant_direct while no merchant Till/Paybill details exist', async () => {
    const { service } = build({ budget: '2500.00' });
    expect(
      await codeOf(service.initiate('e-1', user, { merchantRoute: MerchantRoute.MERCHANT_DIRECT })),
    ).toBe('merchant_details_missing');
  });

  it('allows merchant_direct once Till/Paybill details are set, without the numbers while the fees are unpaid (issue #28)', async () => {
    const { service, payments } = build({
      budget: '2500.00',
      merchant: { merchantName: 'Naivas', merchantTillNumber: '123456' },
    });
    const res = await service.initiate('e-1', user, { merchantRoute: MerchantRoute.MERCHANT_DIRECT });
    expect(payments.create).toHaveBeenCalledWith(
      expect.objectContaining({ paymentFlow: PaymentFlow.MERCHANT_DIRECT }),
    );
    expect(res.merchantDetailsAvailable).toBe(true);
    expect(res.merchantPayment).toEqual({
      route: 'merchant_direct',
      amount: '2500.00',
      paidTo: 'merchant',
      merchantName: 'Naivas',
      tillNumber: null,
      paybillNumber: null,
      accountReference: null,
      merchantDetailsUpdatedAt: null,
      merchantDetailsChangedAfterPayment: false,
    });
  });

  it('returns the merchant numbers on a replay once the fee payment has completed (issue #28)', async () => {
    const keyed = {
      id: 'p-1',
      errandId: 'e-1',
      status: PaymentStatus.COMPLETED,
      createdAt: new Date(),
      paymentFlow: PaymentFlow.MERCHANT_DIRECT,
      merchantAmount: '2500.00',
    };
    const { service } = build({
      keyed,
      feesPaid: true,
      merchant: { merchantName: 'KPLC', merchantPaybillNumber: '888880', merchantAccountReference: 'ACC-1' },
    });
    const res = await service.initiate('e-1', user, { idempotencyKey: 'key-12345678' });
    expect(res.merchantPayment).toMatchObject({
      route: 'merchant_direct',
      merchantName: 'KPLC',
      tillNumber: null,
      paybillNumber: '888880',
      accountReference: 'ACC-1',
    });
  });

  it('collects send_to_runner by STK to Nitume with a merchant_payment leg (row 42)', async () => {
    const { service, payments, transactions, stk } = build({ budget: '2500.00' });
    const res = await service.initiate('e-1', user, { merchantRoute: MerchantRoute.SEND_TO_RUNNER });
    expect(payments.create).toHaveBeenCalledWith(
      expect.objectContaining({ paymentFlow: PaymentFlow.CUSTOMER_TO_RUNNER, merchantAmount: '2500.00' }),
    );
    expect(transactions.save).toHaveBeenCalledWith([
      expect.objectContaining({ paymentTypeId: 'type-service_fee', amount: '200.00' }),
      expect.objectContaining({ paymentTypeId: 'type-runner_fee', amount: '300.00' }),
      expect.objectContaining({ paymentTypeId: 'type-merchant_payment', amount: '2500.00' }),
    ]);
    // service 200 + runner 300 + purchase 2500, one push to Nitume.
    expect(stk.initiateStk).toHaveBeenCalledWith(expect.objectContaining({ amountKes: '3000.00' }));
    expect(res.merchantPayment).toEqual({ route: 'send_to_runner', amount: '2500.00', paidTo: 'nitume' });
  });

  it('keeps merchant_direct out of the STK charge', async () => {
    const { service, stk } = build({
      budget: '2500.00',
      merchant: { merchantName: 'Naivas', merchantTillNumber: '123456' },
    });
    await service.initiate('e-1', user, { merchantRoute: MerchantRoute.MERCHANT_DIRECT });
    expect(stk.initiateStk).toHaveBeenCalledWith(expect.objectContaining({ amountKes: '500.00' }));
  });

  it('stores the provider checkout ids on the legs after the push', async () => {
    const { service, transactions } = build();
    await service.initiate('e-1', user);
    expect(transactions.merge).toHaveBeenCalledWith(
      expect.anything(),
      { rawCallback: { stkPush: { checkoutRequestId: 'chk-1', merchantRequestId: null, providerReference: null, gateway: 'console' } } },
    );
  });

  it('charges the selected M-Pesa method, then the default, then the login phone', async () => {
    const methods = [
      { id: 'm-1', type: PaymentMethodType.MPESA, phoneNumber: '+254711111111', isDefault: false },
      { id: 'm-2', type: PaymentMethodType.MPESA, phoneNumber: '+254722222222', isDefault: true },
    ];
    const chosen = build({ methods });
    await chosen.service.initiate('e-1', user, { paymentMethodId: 'm-1' });
    expect(chosen.stk.initiateStk).toHaveBeenCalledWith(expect.objectContaining({ phone: '+254711111111' }));

    const byDefault = build({ methods });
    await byDefault.service.initiate('e-1', user);
    expect(byDefault.stk.initiateStk).toHaveBeenCalledWith(expect.objectContaining({ phone: '+254722222222' }));

    const login = build();
    await login.service.initiate('e-1', user);
    expect(login.stk.initiateStk).toHaveBeenCalledWith(expect.objectContaining({ phone: '+254700000001' }));

    const bad = build({ methods });
    expect(await codeOf(bad.service.initiate('e-1', user, { paymentMethodId: 'nope' }))).toBe(
      'payment_method_invalid',
    );
  });
});

describe('PaymentsService.initiate quote expiry (row 46)', () => {
  it('refuses to push STK for an expired quote with quote_expired', async () => {
    const { service, stk } = build({ quoteExpired: true });
    expect(await codeOf(service.initiate('e-1', user))).toBe('quote_expired');
    expect(stk.initiateStk).not.toHaveBeenCalled();
  });
});

describe('PaymentsService re-quote on ACCEPTED (row 72)', () => {
  it('refuses to push STK until the customer accepts the new quote', async () => {
    const { service, stk } = build({ quoteNotAccepted: true });
    expect(await codeOf(service.initiate('e-1', user))).toBe('quote_not_accepted');
    expect(stk.initiateStk).not.toHaveBeenCalled();
  });

  it('checks the payable quote again inside the payment transaction', async () => {
    const { service, errands } = build();
    await service.initiate('e-1', user);
    expect(errands.payableQuote).toHaveBeenCalledTimes(2);
    expect(errands.payableQuote).toHaveBeenLastCalledWith('e-1', expect.anything());
  });

  it('registers a re-quote guard that refuses while a payment is in flight', async () => {
    const { service, errands } = build();
    service.onModuleInit();
    const guard = errands.onRequote.mock.calls[0][0] as (m: unknown, id: string) => Promise<void>;
    const managerWith = (row: object | null) => ({
      getRepository: () => ({ findOne: vi.fn(() => Promise.resolve(row)) }),
    });
    await expect(guard(managerWith(null), 'e-1')).resolves.toBeUndefined();
    await expect(
      guard(managerWith({ id: 'p-1', status: PaymentStatus.PENDING }), 'e-1'),
    ).rejects.toMatchObject({ code: 'payment_in_progress' });
  });
});

describe('Merchant numbers before the fees are paid (issue #28)', () => {
  const admin = { userId: 'a-1', role: UserRole.ADMIN, phone: '+254700000099' } as never;
  const merchant = { merchantName: 'KPLC', merchantPaybillNumber: '888880', merchantAccountReference: 'ACC-1' };
  const directPayment = (status: PaymentStatus) => ({
    id: 'p-1',
    errandId: 'e-1',
    status,
    createdAt: new Date(),
    paymentFlow: PaymentFlow.MERCHANT_DIRECT,
    merchantAmount: '2500.00',
  });
  const numbersOf = (mp: unknown) => {
    const v = mp as { tillNumber: string | null; paybillNumber: string | null; accountReference: string | null };
    return { tillNumber: v.tillNumber, paybillNumber: v.paybillNumber, accountReference: v.accountReference };
  };
  const hidden = { tillNumber: null, paybillNumber: null, accountReference: null };
  const shown = { tillNumber: null, paybillNumber: '888880', accountReference: 'ACC-1' };

  it('feesPaidAmong reads completed primary payments only, in one query', async () => {
    const { service, payments } = build({ feesPaid: true });
    expect(await service.feesPaidAmong(['e-1', 'e-2'])).toEqual(new Set(['e-1']));
    expect(payments.find).toHaveBeenCalledTimes(1);
    const where = (payments.find.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    expect(where.status).toBe(PaymentStatus.COMPLETED);
    expect(where.priceChangeRequestId).toEqual(expect.objectContaining({ _type: 'isNull' }));
    expect(await service.feesPaid('e-1')).toBe(true);
    expect(await build({ feesPaid: false }).service.feesPaid('e-1')).toBe(false);
  });

  it('feesPaidAmong makes no query for an empty list', async () => {
    const { service, payments } = build();
    expect(await service.feesPaidAmong([])).toEqual(new Set());
    expect(payments.find).not.toHaveBeenCalled();
  });

  it('registers the fee-paid lookup with the errands module', async () => {
    const { service, errands } = build({ feesPaid: true });
    service.onModuleInit();
    expect(errands.onFeesPaidLookup).toHaveBeenCalledTimes(1);
    const lookup = errands.onFeesPaidLookup.mock.calls[0][0] as (ids: string[]) => Promise<Set<string>>;
    expect(await lookup(['e-1'])).toEqual(new Set(['e-1']));
  });

  it('GET /payments/:errandId: a customer gets no numbers while the fee payment is pending', async () => {
    const { service } = build({ existing: directPayment(PaymentStatus.PENDING), merchant, feesPaid: false });
    const res = await service.listForErrand('e-1', user);
    expect(res.merchantDetailsAvailable).toBe(true);
    expect(res.merchantPayment).toMatchObject({ route: 'merchant_direct', merchantName: 'KPLC', amount: '2500.00' });
    expect(numbersOf(res.merchantPayment)).toEqual(hidden);
  });

  it('GET /payments/:errandId: a customer gets the numbers once the fee payment has completed', async () => {
    const { service } = build({ existing: directPayment(PaymentStatus.COMPLETED), merchant, feesPaid: true });
    const res = await service.listForErrand('e-1', user);
    expect(numbersOf(res.merchantPayment)).toEqual(shown);
  });

  it('GET /payments/:errandId: an admin gets the numbers before and after payment (unchanged)', async () => {
    const before = await build({ existing: directPayment(PaymentStatus.PENDING), merchant, feesPaid: false })
      .service.listForErrand('e-1', admin);
    expect(numbersOf(before.merchantPayment)).toEqual(shown);
    const after = await build({ existing: directPayment(PaymentStatus.COMPLETED), merchant, feesPaid: true })
      .service.listForErrand('e-1', admin);
    expect(numbersOf(after.merchantPayment)).toEqual(shown);
  });
});
