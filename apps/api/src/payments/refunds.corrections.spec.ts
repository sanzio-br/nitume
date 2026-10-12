import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../common/api-error';
import { ErrandCategory, ErrandStatus } from '../common/enums';
import {
  RefundPayoutCorrection,
  RefundPayoutCorrectionKind,
} from './refund-payout-correction.entity';
import { RefundReview, RefundStatus, RefundTrigger } from './refund-review.entity';
import {
  PayoutCorrectionInput,
  RefundsService,
  effectivePayoutOf,
  refundPositionOf,
  toCustomerView,
} from './refunds.service';

const K = RefundPayoutCorrectionKind;
const PAID_AT = new Date('2026-10-10T08:00:00Z');

const review = (over: Partial<RefundReview> = {}): RefundReview =>
  Object.assign(new RefundReview(), {
    id: 'r-1',
    errandId: 'e-1',
    priceChangeRequestId: null,
    trigger: RefundTrigger.EXPIRED_AFTER_PAYMENT,
    amountPaid: '1500.00',
    refundAmount: '1000.00',
    status: RefundStatus.REFUNDED,
    payoutReference: 'QAB123XYZ',
    paidByUserId: 'admin-2',
    paidAt: PAID_AT,
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
    getRawOne: vi.fn(() =>
      Promise.resolve({ total: '1500.00', fees: '500.00', item: '1000.00', differences: '0' }),
    ),
    getRawMany: vi.fn(() => Promise.resolve([{ errandId: 'e-1', total: '1500.00' }])),
  };
  return b;
};

const build = (row: RefundReview = review(), others: RefundReview[] = [], usedRefs: string[] = []) => {
  const original = { payoutReference: row.payoutReference, paidAt: row.paidAt, refundAmount: row.refundAmount };
  const table: RefundPayoutCorrection[] = [];
  let seq = 0;
  const corrections = {
    find: vi.fn(({ where }: { where: { refundReviewId: { value: string[] } } }) =>
      Promise.resolve(table.filter((c) => where.refundReviewId.value.includes(c.refundReviewId))),
    ),
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
    find: vi.fn(() => Promise.resolve([row, ...others])),
    save: vi.fn((r: RefundReview) => Promise.resolve(r)),
  };
  const query = vi.fn((_sql: string, [ref]: string[]) =>
    Promise.resolve(
      usedRefs.includes(ref) || table.some((c) => c.newReference === ref) || row.payoutReference === ref
        ? [{ '?column?': 1 }]
        : [],
    ),
  );
  const transactions = { createQueryBuilder: vi.fn(qb) };
  const manager = {
    query,
    getRepository: (entity: { name: string }) =>
      entity.name === 'RefundPayoutCorrection'
        ? corrections
        : entity.name === 'RefundReview'
          ? reviewRepo
          : transactions,
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
  const emit = vi.fn();
  const service = new RefundsService(
    reviews as never,
    { createQueryBuilder: vi.fn(qb) } as never,
    transactions as never,
    errands as never,
    { emit } as never,
    users as never,
    undefined,
    undefined,
    corrections as never,
  );
  const add = (input: Omit<PayoutCorrectionInput, 'expectedLatestCorrectionId'>, admin = 'admin-3') =>
    service.addCorrection(
      'r-1',
      { ...input, expectedLatestCorrectionId: table[table.length - 1]?.id ?? null },
      admin,
    );
  return { service, table, row, original, reviewRepo, emit, add };
};

const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => (e instanceof ApiError ? e.code : String(e)),
  );

const tick = () => new Promise((r) => setImmediate(r));
const reason = 'Typed the wrong receipt';

describe('effectivePayoutOf (row 100)', () => {
  it('null unless refunded; the original payout with corrections applied in order', () => {
    expect(effectivePayoutOf(review({ status: RefundStatus.APPROVED }))).toBeNull();
    expect(effectivePayoutOf(review())).toEqual({
      state: 'sent',
      amount: '1000.00',
      reference: 'QAB123XYZ',
      at: PAID_AT,
    });
    const t1 = new Date('2026-10-11T01:00:00Z');
    const t2 = new Date('2026-10-11T02:00:00Z');
    const t3 = new Date('2026-10-11T03:00:00Z');
    const steps = [
      { kind: K.CORRECTED, newReference: null, newAmount: '900.00', createdAt: t1 },
      { kind: K.REVERSED, newReference: 'REV777', newAmount: null, createdAt: t2 },
    ];
    expect(effectivePayoutOf(review(), steps.slice(0, 1))).toEqual({
      state: 'sent',
      amount: '900.00',
      reference: 'QAB123XYZ',
      at: PAID_AT,
    });
    expect(effectivePayoutOf(review(), steps)).toEqual({
      state: 'reversed',
      amount: '0.00',
      reference: null,
      at: t2,
    });
    expect(
      effectivePayoutOf(review(), [
        ...steps,
        { kind: K.RESENT, newReference: 'QEF888', newAmount: '1000.00', createdAt: t3 },
      ]),
    ).toEqual({ state: 'sent', amount: '1000.00', reference: 'QEF888', at: t3 });
  });
});

describe('RefundsService.addCorrection (row 100, N-15)', () => {
  it('records a corrected receipt as an append-only row; the original payout is untouched', async () => {
    const { table, row, original, reviewRepo, add, emit } = build();
    const out = await add({ kind: K.CORRECTED, newReference: ' qcd456 ', reason: `  ${reason}  ` });
    expect(table).toHaveLength(1);
    expect(table[0]).toMatchObject({
      refundReviewId: 'r-1',
      kind: K.CORRECTED,
      previousReference: 'QAB123XYZ',
      previousAmount: '1000.00',
      newReference: 'QCD456',
      newAmount: null,
      reason,
      createdByUserId: 'admin-3',
    });
    expect(reviewRepo.save).not.toHaveBeenCalled();
    expect({ payoutReference: row.payoutReference, paidAt: row.paidAt, refundAmount: row.refundAmount }).toEqual(original);
    expect(out.payoutReference).toBe('QAB123XYZ');
    expect(out.effectivePayout).toEqual({ state: 'sent', amount: '1000.00', reference: 'QCD456', at: PAID_AT });
    expect(out.corrections).toEqual([
      expect.objectContaining({ id: 'c-1', kind: K.CORRECTED, createdBy: { id: 'admin-3', displayName: 'Finance' } }),
    ]);
    expect(out.correctionCeiling).toBe('1500.00');
    expect(reviewRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
    await tick();
    // Admin refresh only; no customer notification (AQ-9 default).
    expect(emit).toHaveBeenCalledWith('refund.updated', expect.objectContaining({ notifyCustomer: false }));
  });

  it('reversed then resent: snapshots chain and the customer sees approved, then refunded', async () => {
    const { service, table, add, emit } = build();
    await add({ kind: K.CORRECTED, newAmount: 950, reason });
    const reversed = await add({ kind: K.REVERSED, newReference: 'REV777', reason: 'Wrong number' });
    expect(table[1]).toMatchObject({
      kind: K.REVERSED,
      previousReference: 'QAB123XYZ',
      previousAmount: '950.00',
      newReference: 'REV777',
      newAmount: null,
    });
    expect(reversed.effectivePayout).toMatchObject({ state: 'reversed', amount: '0.00', reference: null });
    const owed = await service.forCustomer('e-1', { userId: 'u-1', role: 'customer' });
    expect(owed).toMatchObject({ status: RefundStatus.APPROVED, refundAmount: '1000.00', paidAt: null });

    const resent = await add({ kind: K.RESENT, newReference: 'QEF888', newAmount: 1000, reason: 'Sent again' });
    expect(table[2]).toMatchObject({ previousReference: null, previousAmount: '0.00', newAmount: '1000.00' });
    expect(resent.effectivePayout).toMatchObject({ state: 'sent', amount: '1000.00', reference: 'QEF888' });
    const view = await service.forCustomer('e-1', { userId: 'u-1', role: 'customer' });
    expect(view).toMatchObject({ status: RefundStatus.REFUNDED, refundAmount: '1000.00', paidAt: table[2].createdAt });
    const json = JSON.stringify(view);
    for (const hidden of ['QAB123XYZ', 'QEF888', 'REV777', 'Sent again', 'admin-3', 'internal', 'corrections']) {
      expect(json).not.toContain(hidden);
    }
    await tick();
    const notify = emit.mock.calls.map(([, e]) => (e as { notifyCustomer: boolean }).notifyCustomer);
    expect(notify).toEqual([false, false, true]);
  });

  it('refuses invalid records with the spec error codes', async () => {
    const approved = build(review({ status: RefundStatus.APPROVED, payoutReference: null, paidAt: null }));
    expect(await codeOf(approved.add({ kind: K.CORRECTED, newReference: 'QCD456', reason }))).toBe(
      'refund_not_refunded',
    );
    expect(await codeOf(build().add({ kind: K.CORRECTED, newReference: 'QCD456', reason: ' abc ' }))).toBe(
      'correction_reason_invalid',
    );
    expect(await codeOf(build().add({ kind: K.CORRECTED, newReference: 'qab123xyz', newAmount: 1000, reason }))).toBe(
      'correction_no_change',
    );
    expect(await codeOf(build().add({ kind: K.CORRECTED, reason }))).toBe('correction_no_change');
    expect(await codeOf(build().add({ kind: K.REVERSED, reason }))).toBe('payout_reference_required');
    expect(await codeOf(build().add({ kind: K.REVERSED, newReference: 'REV1', newAmount: 5, reason }))).toBe(
      'payout_amount_not_allowed',
    );
    expect(await codeOf(build().add({ kind: K.RESENT, newReference: 'QEF888', newAmount: 1000, reason }))).toBe(
      'payout_correction_kind_invalid',
    );
    expect(await codeOf(build().add({ kind: K.CORRECTED, newAmount: 1500.01, reason }))).toBe(
      'refund_exceeds_amount_paid',
    );
    expect(await codeOf(build(review(), [], ['QUSED1']).add({ kind: K.CORRECTED, newReference: 'QUSED1', reason }))).toBe(
      'payout_reference_reused',
    );

    const reversedTwice = build();
    await reversedTwice.add({ kind: K.REVERSED, newReference: 'REV777', reason });
    expect(await codeOf(reversedTwice.add({ kind: K.REVERSED, newReference: 'REV778', reason }))).toBe(
      'payout_correction_kind_invalid',
    );
    expect(await codeOf(reversedTwice.add({ kind: K.RESENT, newReference: 'QEF888', reason }))).toBe(
      'payout_amount_required',
    );
    // The reversal code cannot be reused as a payout receipt.
    expect(await codeOf(reversedTwice.add({ kind: K.RESENT, newReference: 'REV777', newAmount: 10, reason }))).toBe(
      'payout_reference_reused',
    );
    expect(reversedTwice.table).toHaveLength(1);
  });

  it('409 payout_correction_conflict on a stale expectedLatestCorrectionId', async () => {
    const { service, add, table } = build();
    await add({ kind: K.CORRECTED, newReference: 'QCD456', reason });
    const err = await service
      .addCorrection('r-1', { kind: K.CORRECTED, newReference: 'QCD457', reason, expectedLatestCorrectionId: null }, 'a')
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'payout_correction_conflict' });
    expect((err as ApiError).getResponse()).toMatchObject({ latestCorrectionId: 'c-1' });
    expect(table).toHaveLength(1);
  });

  it('correctionCeiling is net of the other reviews on the task (row 87)', async () => {
    const decrease = review({
      id: 'r-2',
      priceChangeRequestId: 'pc-1',
      trigger: RefundTrigger.PRICE_CHANGE_DECREASE,
      amountPaid: '200.00',
      refundAmount: '200.00',
      status: RefundStatus.APPROVED,
      payoutReference: null,
      paidAt: null,
    });
    const { add } = build(review(), [decrease]);
    // Paid 1500; the other review commits 200 -> ceiling min(1500, 1300).
    expect(await codeOf(add({ kind: K.CORRECTED, newAmount: 1300.01, reason }))).toBe('refund_exceeds_amount_paid');
    const out = await add({ kind: K.CORRECTED, newAmount: 1300, reason });
    expect(out.correctionCeiling).toBe('1300.00');
  });

  it('keeps mark-paid locked on a refunded review (409 refund_payout_locked)', async () => {
    const { service } = build();
    expect(await codeOf(service.markPaid('r-1', 'QZZ000', 'a'))).toBe('refund_payout_locked');
  });
});

describe('Cumulative cap uses effective payouts (row 87 + row 100)', () => {
  it('a corrected lower payout frees the difference; a reversed payout stays committed', () => {
    const cancel = review({ id: 'r-2', status: RefundStatus.PENDING_REVIEW, refundAmount: null, amountPaid: '1500.00' });
    // r-1 refunded 1000, corrected down to 600 -> committed 600.
    const corrected = review({ refundAmount: '600.00' });
    expect(refundPositionOf(cancel, 1500, [cancel, corrected]).refundCeiling).toBe('900.00');
    // Reversed (owed again) -> commits the decided 1000.
    const reversed = review({ refundAmount: '1000.00' });
    expect(refundPositionOf(cancel, 1500, [cancel, reversed]).refundCeiling).toBe('500.00');
  });

  it('customer view of a review without corrections is unchanged', () => {
    expect(toCustomerView(review(), undefined)).toMatchObject({
      status: RefundStatus.REFUNDED,
      refundAmount: '1000.00',
      paidAt: PAID_AT,
    });
  });
});
