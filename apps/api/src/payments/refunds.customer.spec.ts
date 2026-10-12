import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../common/api-error';
import { UserRole } from '../common/enums';
import { RefundStatus, RefundTrigger } from './refund-review.entity';
import { RefundsService } from './refunds.service';

const build = (
  row: object | null,
  access: 'ok' | 'denied' = 'ok',
  rows: object[] = [],
  paid = '500.00',
) => {
  const reviews = {
    findOne: vi.fn(() => Promise.resolve(row)),
    find: vi.fn(() => Promise.resolve(rows.length > 0 ? rows : row ? [row] : [])),
  };
  const qb = {
    innerJoin: vi.fn(() => qb),
    select: vi.fn(() => qb),
    addSelect: vi.fn(() => qb),
    where: vi.fn(() => qb),
    andWhere: vi.fn(() => qb),
    groupBy: vi.fn(() => qb),
    getRawMany: vi.fn(() => Promise.resolve([{ errandId: 'e-1', total: paid }])),
  };
  const transactions = { createQueryBuilder: vi.fn(() => qb) };
  const errands = {
    onTerminated: vi.fn(),
    getById: vi.fn(() =>
      access === 'ok' ? Promise.resolve({ id: 'e-1' }) : Promise.reject(new ForbiddenException()),
    ),
  };
  const service = new RefundsService(
    reviews as never,
    {} as never,
    transactions as never,
    errands as never,
  );
  return { service, reviews, errands };
};

const customer = { userId: 'u-1', role: UserRole.CUSTOMER };

describe('RefundsService.forCustomer (row 55)', () => {
  it('returns status and amounts without admin notes or user ids', async () => {
    const { service, errands } = build({
      id: 'r-1',
      errandId: 'e-1',
      trigger: RefundTrigger.CANCELLED_AFTER_PAYMENT,
      status: RefundStatus.APPROVED,
      amountPaid: '500.00',
      refundAmount: '400.00',
      decisionNote: 'internal',
      decidedByUserId: 'admin-1',
      payoutReference: null,
      createdAt: new Date('2026-10-08T08:00:00Z'),
      decidedAt: new Date('2026-10-08T09:00:00Z'),
      paidAt: null,
    });
    const view = await service.forCustomer('e-1', customer);
    expect(errands.getById).toHaveBeenCalledWith('e-1', customer);
    expect(view).toEqual({
      id: 'r-1',
      errandId: 'e-1',
      trigger: RefundTrigger.CANCELLED_AFTER_PAYMENT,
      priceChangeRequestId: null,
      status: RefundStatus.APPROVED,
      amountPaid: '500.00',
      refundAmount: '400.00',
      remainingRefundable: '100.00',
      createdAt: new Date('2026-10-08T08:00:00Z'),
      decidedAt: new Date('2026-10-08T09:00:00Z'),
      paidAt: null,
    });
  });

  it('404s with refund_not_found when there is no refund', async () => {
    const { service } = build(null);
    const err = await service.forCustomer('e-1', customer).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('refund_not_found');
    expect((err as ApiError).getStatus()).toBe(404);
  });

  it('refuses callers without errand access', async () => {
    const { service, reviews } = build(null, 'denied');
    await expect(service.forCustomer('e-1', customer)).rejects.toBeInstanceOf(ForbiddenException);
    expect(reviews.findOne).not.toHaveBeenCalled();
  });
});

describe('RefundsService with several reviews (row 71)', () => {
  const decrease = {
    id: 'r-2',
    errandId: 'e-1',
    priceChangeRequestId: 'pc-1',
    trigger: RefundTrigger.PRICE_CHANGE_DECREASE,
    status: RefundStatus.PENDING_REVIEW,
    amountPaid: '80.00',
    refundAmount: null,
    payoutReference: null,
    createdAt: new Date('2026-10-08T10:00:00Z'),
    decidedAt: null,
    paidAt: null,
  };

  it('GET /errands/:id/refunds lists every review in the customer shape', async () => {
    const { service } = build(null, 'ok', [decrease]);
    const out = await service.forCustomerAll('e-1', customer);
    expect(out.items).toEqual([
      {
        id: 'r-2',
        errandId: 'e-1',
        trigger: RefundTrigger.PRICE_CHANGE_DECREASE,
        priceChangeRequestId: 'pc-1',
        status: RefundStatus.PENDING_REVIEW,
        amountPaid: '80.00',
        refundAmount: null,
        remainingRefundable: '500.00',
        createdAt: decrease.createdAt,
        decidedAt: null,
        paidAt: null,
      },
    ]);
  });

  it('GET /errands/:id/refund falls back to the newest review without a cancellation review', async () => {
    const { service, reviews } = build(null);
    reviews.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(decrease);
    const view = await service.forCustomer('e-1', customer);
    expect(view.id).toBe('r-2');
  });
});

describe('Customer refund views never expose the admin decision note (row 69)', () => {
  it('omits decisionNote and admin ids on both refund endpoints', async () => {
    const decided = {
      id: 'r-1',
      errandId: 'e-1',
      priceChangeRequestId: null,
      trigger: RefundTrigger.CANCELLED_AFTER_PAYMENT,
      status: RefundStatus.NO_REFUND,
      amountPaid: '500.00',
      refundAmount: '0.00',
      decisionNote: 'Runner already bought the item; internal only',
      decidedByUserId: 'admin-1',
      paidByUserId: null,
      payoutReference: null,
      createdAt: new Date(),
      decidedAt: new Date(),
      paidAt: null,
    };
    const { service } = build(decided);
    const one = await service.forCustomer('e-1', customer);
    const all = await service.forCustomerAll('e-1', customer);
    for (const view of [one, ...all.items]) {
      expect(view).not.toHaveProperty('decisionNote');
      expect(view).not.toHaveProperty('decidedByUserId');
      expect(view).not.toHaveProperty('paidByUserId');
      expect(view).not.toHaveProperty('payoutReference');
      expect(JSON.stringify(view)).not.toContain('internal only');
    }
  });
});
