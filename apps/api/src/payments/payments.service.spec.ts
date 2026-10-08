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
      }),
    ),
    assertQuoteCurrentFor: vi.fn(() =>
      opts.quoteExpired
        ? Promise.reject(new ApiError(409, 'quote_expired', 'expired'))
        : Promise.resolve(),
    ),
  };
  const stk = { push: vi.fn(() => Promise.resolve({ checkoutRequestId: 'chk-1', transactionId: 't' })) };
  const config = { get: vi.fn((_k: string, d: unknown) => d) };
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
  );
  return { service, payments, transactions, stk };
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

describe('PaymentsService.initiate', () => {
  it('returns the payment stored under the same Idempotency-Key without pushing', async () => {
    const keyed = { id: 'p-1', errandId: 'e-1', status: PaymentStatus.PENDING, createdAt: new Date(), paymentFlow: PaymentFlow.PLATFORM_ONLY };
    const { service, stk } = build({ keyed });
    const res = await service.initiate('e-1', user, { idempotencyKey: 'key-12345678' });
    expect(res.payment).toBe(keyed);
    expect(res.stkStatus).toBe(StkStatus.PENDING);
    expect(stk.push).not.toHaveBeenCalled();
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
    expect(stk.push).not.toHaveBeenCalled();
  });

  it('pushes a fresh charge with the key after a FAILED payment', async () => {
    const existing = { id: 'p-0', errandId: 'e-1', status: PaymentStatus.FAILED, createdAt: new Date(), paymentFlow: PaymentFlow.PLATFORM_ONLY };
    const { service, stk, payments } = build({ existing });
    const res = await service.initiate('e-1', user, { idempotencyKey: 'retry-key-01' });
    expect(stk.push).toHaveBeenCalledTimes(1);
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
    expect(stk.push).not.toHaveBeenCalled();
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
    expect(stk.push).not.toHaveBeenCalled();
  });

  it('rethrows a unique violation when no winning payment is found', async () => {
    const { service, stk } = build({ conflict: true });
    expect(await codeOf(service.initiate('e-1', user))).toMatch(/duplicate key/);
    expect(stk.push).not.toHaveBeenCalled();
  });

  it('writes the payment and its two legs in one transaction before pushing', async () => {
    const { service, payments, transactions, stk } = build();
    await service.initiate('e-1', user);
    expect(payments.manager.transaction).toHaveBeenCalledTimes(1);
    expect(transactions.save).toHaveBeenCalledWith([
      expect.objectContaining({ paymentId: 'p-new', paymentTypeId: 'type-service_fee' }),
      expect.objectContaining({ paymentId: 'p-new', paymentTypeId: 'type-runner_fee' }),
    ]);
    expect(stk.push).toHaveBeenCalledTimes(1);
  });

  it('requires a merchant route when there is a merchant amount', async () => {
    const { service } = build({ budget: '2500.00' });
    expect(await codeOf(service.initiate('e-1', user))).toBe('merchant_route_required');
  });

  it('refuses merchant_direct while no merchant Till/Paybill details exist', async () => {
    const { service } = build({ budget: '2500.00' });
    expect(
      await codeOf(service.initiate('e-1', user, { merchantRoute: MerchantRoute.MERCHANT_DIRECT })),
    ).toBe('merchant_details_missing');
  });

  it('records send_to_runner as customer_to_runner without Till/Paybill fields', async () => {
    const { service, payments } = build({ budget: '2500.00' });
    const res = await service.initiate('e-1', user, { merchantRoute: MerchantRoute.SEND_TO_RUNNER });
    expect(payments.create).toHaveBeenCalledWith(
      expect.objectContaining({ paymentFlow: PaymentFlow.CUSTOMER_TO_RUNNER, merchantAmount: '2500.00' }),
    );
    expect(res.merchantPayment).toEqual({ route: 'send_to_runner', amount: '2500.00' });
  });

  it('charges the selected M-Pesa method, then the default, then the login phone', async () => {
    const methods = [
      { id: 'm-1', type: PaymentMethodType.MPESA, phoneNumber: '+254711111111', isDefault: false },
      { id: 'm-2', type: PaymentMethodType.MPESA, phoneNumber: '+254722222222', isDefault: true },
    ];
    const chosen = build({ methods });
    await chosen.service.initiate('e-1', user, { paymentMethodId: 'm-1' });
    expect(chosen.stk.push).toHaveBeenCalledWith(expect.objectContaining({ phone: '+254711111111' }));

    const byDefault = build({ methods });
    await byDefault.service.initiate('e-1', user);
    expect(byDefault.stk.push).toHaveBeenCalledWith(expect.objectContaining({ phone: '+254722222222' }));

    const login = build();
    await login.service.initiate('e-1', user);
    expect(login.stk.push).toHaveBeenCalledWith(expect.objectContaining({ phone: '+254700000001' }));

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
    expect(stk.push).not.toHaveBeenCalled();
  });
});
