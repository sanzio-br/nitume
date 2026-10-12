import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../common/api-error';
import { ErrandCategory, ErrandStatus } from '../common/enums';
import {
  RefundPayoutCorrection,
  RefundPayoutCorrectionKind,
} from './refund-payout-correction.entity';
import { RefundReview, RefundStatus, RefundTrigger } from './refund-review.entity';
import { RefundsService, effectivePayoutOf, toCustomerView } from './refunds.service';

const C = RefundPayoutCorrectionKind.CORRECTION;
const R = RefundPayoutCorrectionKind.REVERSAL;

const review = (over: Partial<RefundReview> = {}): RefundReview =>
  Object.assign(new RefundReview(), {
    id: 'r-1',
    errandId: 'e-1',
    priceChangeRequestId: null,
    trigger: RefundTrigger.TASK_EXPIRED,
    amountPaid: '1500.00',
    refundAmount: '1000.00',
    status: RefundStatus.REFUNDED,
    payoutReference: 'QAB123XYZ',
    paidByUserId: 'admin-2',
    paidAt: new Date('2026-10-10T08:00:00Z'),
    decidedByUserId: 'admin-1',
    decisionNote: 'internal',
    createdAt: new Date('2026-10-08T08:00:00Z'),
    ...over,
  });

const qb = () => {
  const b = {
    innerJoin: vi.fn(() => b),
    select: vi.fn(() => b),
    addSelect: vi.fn(() => b),
    where: vi.fn(() => b),
    andWhere: vi.fn(() => b),
    setParameters: vi.fn(() => b),
    groupBy: vi.fn(() => b),
    getRawOne: vi.fn(() => Promise.resolve({ total: '0', fees: '500', item: '1000', differences: '0' })),
    getRawMany: vi.fn(() => Promise.resolve([{ errandId: 'e-1', total: '1500.00' }])),
  };
  return b;
};

const build = (row: RefundReview = review()) => {
  const original = { payoutReference: row.payoutReference, paidAt: row.paidAt };
  const table: RefundPayoutCorrection[] = [];
  let seq = 0;
  const corrections = {
    find: vi.fn(() => Promise.resolve([...table])),
    create: vi.fn((c: object) => Object.assign(new RefundPayoutCorrection(), c)),
    save: vi.fn((c: RefundPayoutCorrection) => {
      seq += 1;
      Object.assign(c, { id: `c-${seq}`, createdAt: new Date(Date.UTC(2026, 9, 11, 0, seq)) });
      table.push(c);
      return Promise.resolve(c);
    }),
  };
  const reviewRepo = {
    findOne: vi.fn(() => Promise.resolve(row)),
    find: vi.fn(() => Promise.resolve([row])),
    save: vi.fn((r: RefundReview) => Promise.resolve(r)),
  };
  const manager = {
    getRepository: (entity: { name: string }) =>
      entity.name === 'RefundPayoutCorrection' ? corrections : reviewRepo,
  };
  const reviews = {
    ...reviewRepo,
    manager: { transaction: vi.fn((fn: (m: unknown) => Promise<unknown>) => fn(manager)) },
  };
  const errands = {
    onTerminated: vi.fn(),
    findByIds: vi.fn(() =>
      Promise.resolve([
        {
          id: 'e-1',
          reference: 'NT-1',
          title: null,
          description: 'x',
          category: ErrandCategory.BUY_FOR_ME,
          status: ErrandStatus.EXPIRED,
        },
      ]),
    ),
    getById: vi.fn(() => Promise.resolve({ id: 'e-1', customerId: 'cust-1' })),
  };
  const users = { displayNames: vi.fn(() => Promise.resolve(new Map([['admin-3', 'Finance']]))) };
  const service = new RefundsService(
    reviews as never,
    { createQueryBuilder: vi.fn(qb) } as never,
    { createQueryBuilder: vi.fn(qb) } as never,
    errands as never,
    undefined,
    users as never,
    undefined,
    undefined,
    corrections as never,
  );
  return { service, table, row, original, reviewRepo, reviews };
};

const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => (e instanceof ApiError ? e.code : String(e)),
  );

const reason = 'Admin typed the wrong M-Pesa receipt';

describe('effectivePayoutOf (row 100)', () => {
  it('is null before refunded, paid without records, the latest record after', () => {
    expect(effectivePayoutOf(review({ status: RefundStatus.APPROVED }), []).payoutStatus).toBeNull();
    expect(effectivePayoutOf(review(), [])).toEqual({
      payoutStatus: 'paid',
      effectivePayoutReference: 'QAB123XYZ',
      effectivePaidAmount: '1000.00',
    });
    const corrected = [{ kind: C, newPayoutReference: 'QAB999', amount: '900.00' }];
    expect(effectivePayoutOf(review(), corrected)).toEqual({
      payoutStatus: 'corrected',
      effectivePayoutReference: 'QAB999',
      effectivePaidAmount: '900.00',
    });
    const reversed = [...corrected, { kind: R, newPayoutReference: null, amount: '900.00' }];
    expect(effectivePayoutOf(review(), reversed)).toEqual({
      payoutStatus: 'reversed',
      effectivePayoutReference: 'QAB999',
      effectivePaidAmount: '0.00',
    });
  });
});

describe('RefundsService.addCorrection (row 100)', () => {
  it('records a correction without touching the original receipt', async () => {
    const { service, table, row, original, reviewRepo } = build();
    const out = await service.addCorrection(
      'r-1',
      { kind: C, newPayoutReference: 'QCD456', reason: `  ${reason}  ` },
      'admin-3',
    );
    expect(table).toHaveLength(1);
    expect(table[0]).toMatchObject({
      refundReviewId: 'r-1',
      kind: C,
      previousPayoutReference: 'QAB123XYZ',
      newPayoutReference: 'QCD456',
      amount: '1000.00',
      reason,
      createdByUserId: 'admin-3',
    });
    // Original row immutable.
    expect(reviewRepo.save).not.toHaveBeenCalled();
    expect(row.payoutReference).toBe(original.payoutReference);
    expect(row.paidAt).toBe(original.paidAt);
    expect(out.payoutReference).toBe('QAB123XYZ');
    expect(out).toMatchObject({
      payoutStatus: 'corrected',
      effectivePayoutReference: 'QCD456',
      effectivePaidAmount: '1000.00',
    });
    expect(out.corrections).toHaveLength(1);
    expect(out.corrections[0].createdBy).toEqual({ id: 'admin-3', displayName: 'Finance' });
    // The review row is locked while recording.
    expect(reviewRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
  });

  it('chains previousPayoutReference through corrections and reversals', async () => {
    const { service, table } = build();
    await service.addCorrection('r-1', { kind: C, newPayoutReference: 'QCD456', reason }, 'admin-3');
    const reversed = await service.addCorrection(
      'r-1',
      { kind: R, newPayoutReference: 'REV777', reason: 'Customer number was wrong, M-Pesa reversed it' },
      'admin-3',
    );
    expect(table[1]).toMatchObject({
      kind: R,
      previousPayoutReference: 'QCD456',
      newPayoutReference: 'REV777',
      amount: '1000.00',
    });
    expect(reversed).toMatchObject({
      payoutStatus: 'reversed',
      effectivePayoutReference: 'QCD456',
      effectivePaidAmount: '0.00',
    });
    // Paid again after the reversal: a correction with the new receipt.
    const repaid = await service.addCorrection(
      'r-1',
      { kind: C, newPayoutReference: 'QEF888', reason: 'Paid again to the right number' },
      'admin-3',
    );
    expect(table[2]).toMatchObject({ previousPayoutReference: 'QCD456', amount: '1000.00' });
    expect(repaid.payoutStatus).toBe('corrected');
    expect(repaid.effectivePaidAmount).toBe('1000.00');
  });

  it('rejects invalid records with stable codes', async () => {
    expect(
      await codeOf(
        build(review({ status: RefundStatus.APPROVED })).service.addCorrection(
          'r-1',
          { kind: C, newPayoutReference: 'QCD456', reason },
          'a',
        ),
      ),
    ).toBe('refund_not_refunded');
    expect(
      await codeOf(build().service.addCorrection('r-1', { kind: C, newPayoutReference: 'QCD456', reason: ' short ' }, 'a')),
    ).toBe('correction_reason_required');
    expect(await codeOf(build().service.addCorrection('r-1', { kind: C, reason }, 'a'))).toBe(
      'payout_reference_required',
    );
    expect(
      await codeOf(build().service.addCorrection('r-1', { kind: C, newPayoutReference: 'QCD456', amount: 1000.01, reason }, 'a')),
    ).toBe('correction_amount_exceeds_refund');
    expect(
      await codeOf(build().service.addCorrection('r-1', { kind: C, newPayoutReference: 'QAB123XYZ', reason }, 'a')),
    ).toBe('correction_no_change');
    expect(
      await codeOf(build().service.addCorrection('r-1', { kind: R, amount: 10, reason }, 'a')),
    ).toBe('reversal_amount_not_supported');

    const twice = build();
    await twice.service.addCorrection('r-1', { kind: R, reason }, 'a');
    expect(await codeOf(twice.service.addCorrection('r-1', { kind: R, reason }, 'a'))).toBe(
      'refund_payout_already_reversed',
    );
    expect(twice.table).toHaveLength(1);
  });

  it('keeps mark-paid locked on a refunded review (409 refund_payout_locked)', async () => {
    const { service } = build();
    expect(await codeOf(service.markPaid('r-1', 'QZZ000', 'a'))).toBe('refund_payout_locked');
  });

  it('customer view shows only the effective status and amount', async () => {
    const { service } = build();
    await service.addCorrection('r-1', { kind: C, newPayoutReference: 'QCD456', amount: 800, reason }, 'admin-3');
    const corrected = await service.forCustomer('e-1', { userId: 'u-1', role: 'customer' });
    expect(corrected).toMatchObject({ status: RefundStatus.REFUNDED, payoutStatus: 'paid', paidAmount: '800.00' });
    await service.addCorrection('r-1', { kind: R, reason }, 'admin-3');
    const view = await service.forCustomer('e-1', { userId: 'u-1', role: 'customer' });
    expect(view).toMatchObject({ payoutStatus: 'reversed', paidAmount: '0.00' });
    const json = JSON.stringify(view);
    for (const hidden of ['QAB123XYZ', 'QCD456', reason, 'admin-3', 'internal', 'corrections']) {
      expect(json).not.toContain(hidden);
    }
    expect(toCustomerView(review({ status: RefundStatus.APPROVED }), undefined)).toMatchObject({
      payoutStatus: null,
      paidAmount: null,
    });
  });
});
