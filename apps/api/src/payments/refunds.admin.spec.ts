import { describe, expect, it, vi } from 'vitest';
import { ErrandCategory, ErrandStatus, PaymentMethodType } from '../common/enums';
import { RefundReview, RefundStatus, RefundTrigger } from './refund-review.entity';
import { RefundsService, shortNameOf } from './refunds.service';

const row = (over: Partial<RefundReview> = {}): RefundReview =>
  Object.assign(new RefundReview(), {
    id: 'r-1',
    errandId: 'e-1',
    priceChangeRequestId: null,
    trigger: RefundTrigger.CANCELLED_AFTER_PAYMENT,
    amountPaid: '1500.00',
    refundAmount: '1000.00',
    status: RefundStatus.REFUNDED,
    decidedByUserId: 'admin-1',
    paidByUserId: 'admin-2',
    createdAt: new Date('2026-10-08T08:00:00Z'),
    ...over,
  });

const qb = (raw: object) => {
  const b = {
    innerJoin: vi.fn(() => b),
    select: vi.fn(() => b),
    addSelect: vi.fn(() => b),
    where: vi.fn(() => b),
    andWhere: vi.fn(() => b),
    setParameters: vi.fn(() => b),
    groupBy: vi.fn(() => b),
    getRawOne: vi.fn(() => Promise.resolve(raw)),
    getRawMany: vi.fn(() => Promise.resolve([{ errandId: 'e-1', total: '1650.00' }])),
  };
  return b;
};

const build = () => {
  const reviews = {
    findOne: vi.fn(() => Promise.resolve(row())),
    find: vi.fn(() =>
      Promise.resolve([
        row(),
        row({
          id: 'r-2',
          priceChangeRequestId: 'pc-1',
          trigger: RefundTrigger.PRICE_CHANGE_DECREASE,
          amountPaid: '80.00',
          refundAmount: null,
          status: RefundStatus.PENDING_REVIEW,
        }),
      ]),
    ),
    count: vi.fn(() => Promise.resolve(3)),
  };
  const payments = { createQueryBuilder: vi.fn(() => qb({ total: '0' })) };
  const transactions = {
    createQueryBuilder: vi.fn(() => qb({ fees: '500.00', item: '1000.00', differences: '150.00' })),
  };
  const errands = {
    onCancelled: vi.fn(),
    findByIds: vi.fn(() =>
      Promise.resolve([
        {
          id: 'e-1',
          reference: 'NT-10001',
          title: 'Groceries',
          description: 'Buy milk',
          category: ErrandCategory.BUY_FOR_ME,
          status: ErrandStatus.CANCELLED,
          customerId: 'cust-1',
        },
      ]),
    ),
    getById: vi.fn(() => Promise.resolve({ id: 'e-1', customerId: 'cust-1' })),
  };
  const users = {
    displayNames: vi.fn(() => Promise.resolve(new Map([['admin-1', 'Ops Lead']]))),
    findById: vi.fn(() =>
      Promise.resolve({ id: 'u-9', phone: '+254700000009', displayName: 'Amina Wanjiru' }),
    ),
  };
  const accounts = {
    listPaymentMethods: vi.fn(() =>
      Promise.resolve([
        { type: PaymentMethodType.MPESA, isDefault: true, phoneNumber: '+254711111111' },
      ]),
    ),
  };
  const customers = { findByIds: vi.fn(() => Promise.resolve([{ id: 'cust-1', userId: 'u-9' }])) };
  const service = new RefundsService(
    reviews as never,
    payments as never,
    transactions as never,
    errands as never,
    undefined,
    users as never,
    accounts as never,
    customers as never,
  );
  return { service, reviews };
};

describe('RefundsService admin views (N-1, N-2, N-7)', () => {
  it('detail adds errand summary, admin names, customer M-Pesa phone and paid breakdown', async () => {
    const { service } = build();
    const out = await service.detail('r-1');
    expect(out.errand).toEqual({
      id: 'e-1',
      reference: 'NT-10001',
      title: 'Groceries',
      description: 'Buy milk',
      category: ErrandCategory.BUY_FOR_ME,
      status: ErrandStatus.CANCELLED,
    });
    expect(out.decidedBy).toEqual({ id: 'admin-1', displayName: 'Ops Lead' });
    expect(out.paidBy).toEqual({ id: 'admin-2', displayName: null });
    expect(out.customer).toEqual({
      userId: 'u-9',
      displayName: 'Amina Wanjiru',
      shortName: 'Amina W.',
      phone: '+254700000009',
      mpesaPhone: '+254711111111',
    });
    expect(out.paid).toEqual({
      serviceAndRunnerFee: '500.00',
      itemAmountToNitume: '1000.00',
      priceChangeDifferences: '150.00',
      totalPaidToNitume: '1650.00',
      merchantDirectAmount: '0.00',
    });
    // Row 87: this review refunded 1000 of the 1650 paid to Nitume.
    expect(out).toMatchObject({
      totalPaidToNitume: '1650.00',
      alreadyRefunded: '0.00',
      remainingRefundable: '650.00',
      refundCeiling: null,
    });
    expect(out.otherReviews).toEqual([
      {
        id: 'r-2',
        trigger: RefundTrigger.PRICE_CHANGE_DECREASE,
        status: RefundStatus.PENDING_REVIEW,
        amountPaid: '80.00',
        refundAmount: null,
      },
    ]);
  });

  it('count filters by status', async () => {
    const { service, reviews } = build();
    await expect(service.count(RefundStatus.PENDING_REVIEW)).resolves.toEqual({ count: 3 });
    expect(reviews.count).toHaveBeenCalledWith({ where: { status: RefundStatus.PENDING_REVIEW } });
  });

  it('shortNameOf', () => {
    expect(shortNameOf('Amina Wanjiru Otieno')).toBe('Amina O.');
    expect(shortNameOf('Amina')).toBe('Amina');
    expect(shortNameOf(null)).toBeNull();
  });
});

describe('RefundsService.openForDecrease (row 71)', () => {
  it('inserts one review per price-change request for the decrease', async () => {
    const { service } = build();
    const created = row({ id: 'r-9', priceChangeRequestId: 'pc-1' });
    const manager = {
      query: vi.fn(() => Promise.resolve([])),
      getRepository: () => ({ findOne: vi.fn(() => Promise.resolve(created)) }),
    };
    const out = await service.openForDecrease(manager as never, 'e-1', 'pc-1', 80);
    const [sql, params] = manager.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/ON CONFLICT \("priceChangeRequestId"\) WHERE "priceChangeRequestId" IS NOT NULL DO NOTHING/);
    expect(params).toEqual(['e-1', 'pc-1', RefundTrigger.PRICE_CHANGE_DECREASE, '80.00']);
    expect(out).toBe(created);
  });

  it('does nothing for a non-positive amount', async () => {
    const { service } = build();
    const manager = { query: vi.fn() };
    await expect(service.openForDecrease(manager as never, 'e-1', 'pc-1', 0)).resolves.toBeNull();
    expect(manager.query).not.toHaveBeenCalled();
  });
});
