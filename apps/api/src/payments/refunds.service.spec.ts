import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../common/api-error';
import { ErrandStatus } from '../common/enums';
import { TransitionGuard } from '../errands/errand-state-machine';
import { RefundReview, RefundStatus, RefundTrigger } from './refund-review.entity';
import { RefundsService, refundPositionOf, triggerFor } from './refunds.service';

const review = (over: Partial<RefundReview> = {}): RefundReview =>
  Object.assign(new RefundReview(), {
    id: 'r-1',
    errandId: 'e-1',
    trigger: RefundTrigger.PRICE_CHANGE_REJECTED,
    amountPaid: '500.00',
    refundAmount: null,
    status: RefundStatus.PENDING_REVIEW,
    ...over,
  });

const build = (
  opts: {
    row?: RefundReview | null;
    status?: ErrandStatus;
    paid?: string;
    siblings?: RefundReview[];
  } = {},
) => {
  // In-memory refund_reviews table keyed by errandId (the unique index).
  const table = new Map<string, RefundReview>();
  const reviews = {
    findOne: vi.fn(({ where }: { where: { id?: string; errandId?: string } }) =>
      Promise.resolve(where.errandId ? (table.get(where.errandId) ?? null) : (opts.row ?? null)),
    ),
    find: vi.fn(() =>
      Promise.resolve([...(opts.row ? [opts.row] : []), ...(opts.siblings ?? [])]),
    ),
    create: vi.fn((r: object) => Object.assign(new RefundReview(), r)),
    save: vi.fn((r: RefundReview) => Promise.resolve(r)),
    manager: {} as { transaction: (fn: (m: unknown) => Promise<unknown>) => Promise<unknown> },
  };
  const qb = {
    innerJoin: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    addSelect: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    getRawOne: vi.fn(() => Promise.resolve({ total: opts.paid ?? '0' })),
    getRawMany: vi.fn(() => Promise.resolve([{ errandId: 'e-1', total: opts.paid ?? '0' }])),
  };
  const transactions = { createQueryBuilder: vi.fn(() => qb) };
  /** Mirrors INSERT ... ON CONFLICT ("errandId") DO UPDATE ... WHERE pending. */
  const query = vi.fn((_sql: string, [errandId, trigger, amountPaid, pending]: string[]) => {
    const existing = table.get(errandId);
    if (!existing) {
      table.set(errandId, review({ id: `r-${table.size + 1}`, errandId, trigger: trigger as RefundTrigger, amountPaid }));
    } else if (existing.status === pending) {
      existing.amountPaid = amountPaid;
    }
    return Promise.resolve([]);
  });
  const manager = {
    query,
    getRepository: (entity: { name: string }) =>
      entity.name === 'RefundReview' ? reviews : transactions,
  };
  reviews.manager.transaction = vi.fn((fn) => fn(manager));
  let hook: ((m: unknown, c: object) => Promise<void>) | undefined;
  const errands = {
    getById: vi.fn(() => Promise.resolve({ id: 'e-1', status: opts.status ?? ErrandStatus.CANCELLED })),
    onCancelled: vi.fn((h: typeof hook) => {
      hook = h;
    }),
  };
  const service = new RefundsService(reviews as never, {} as never, transactions as never, errands as never);
  service.onModuleInit();
  return {
    service,
    reviews,
    table,
    manager,
    query,
    runHook: (change: object) => hook!(manager, change),
    setPaid: (amount: string) => qb.getRawOne.mockResolvedValue({ total: amount }),
  };
};

const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => (e instanceof ApiError ? e.code : String(e)),
  );

describe('RefundsService', () => {
  it('maps the cancelled-from state to a trigger', () => {
    expect(triggerFor(ErrandStatus.IN_PROGRESS)).toBe(RefundTrigger.PRICE_CHANGE_REJECTED);
    expect(triggerFor(ErrandStatus.DISPUTED)).toBe(RefundTrigger.DISPUTE_CUSTOMER_FAVOURABLE);
    expect(triggerFor(ErrandStatus.RUNNER_ASSIGNED)).toBe(RefundTrigger.CANCELLED_AFTER_PAYMENT);
    expect(triggerFor(ErrandStatus.QUOTED, TransitionGuard.PRICE_CHANGE_REJECTION)).toBe(
      RefundTrigger.PRICE_CHANGE_REJECTED,
    );
  });

  it('opens the review inside the cancelling transaction for every cancel path', async () => {
    const cases: [object, RefundTrigger][] = [
      [{ from: ErrandStatus.IN_PROGRESS, guard: TransitionGuard.PRICE_CHANGE_REJECTION }, RefundTrigger.PRICE_CHANGE_REJECTED],
      [{ from: ErrandStatus.DISPUTED }, RefundTrigger.DISPUTE_CUSTOMER_FAVOURABLE],
      [{ from: ErrandStatus.RUNNER_ASSIGNED }, RefundTrigger.CANCELLED_AFTER_PAYMENT],
    ];
    for (const [change, trigger] of cases) {
      const { runHook, table, query, manager } = build({ paid: '500.00' });
      await runHook({ errandId: 'e-1', actor: 'admin', ...change });
      expect(query).toHaveBeenCalledWith(expect.stringMatching(/ON CONFLICT \("errandId"\)/), expect.any(Array));
      expect(table.get('e-1')).toMatchObject({ trigger, amountPaid: '500.00' });
      // Uses the caller's manager, not a transaction of its own.
      expect(manager.query).toBe(query);
    }
  });

  it('does not open a review for an unpaid cancellation', async () => {
    const { runHook, table, query } = build({ paid: '0' });
    await runHook({ errandId: 'e-1', from: ErrandStatus.QUOTED, actor: 'customer' });
    expect(query).not.toHaveBeenCalled();
    expect(table.size).toBe(0);
  });

  it('fails the hook (rolling back the cancel) when the review cannot be written', async () => {
    const { runHook, query } = build({ paid: '500.00' });
    query.mockRejectedValueOnce(new Error('db down'));
    await expect(
      runHook({ errandId: 'e-1', from: ErrandStatus.DISPUTED, actor: 'admin' }),
    ).rejects.toThrow('db down');
  });

  it('keeps one review per errand when the after-commit backstop runs too', async () => {
    const { runHook, service, table, setPaid } = build({ paid: '500.00' });
    await runHook({ errandId: 'e-1', from: ErrandStatus.RUNNER_ASSIGNED, actor: 'admin' });
    setPaid('650.00');
    await service.onStatusChanged({ errandId: 'e-1', status: ErrandStatus.CANCELLED, from: ErrandStatus.RUNNER_ASSIGNED });
    expect(table.size).toBe(1);
    expect(table.get('e-1')?.amountPaid).toBe('650.00');
    // A decided review is not touched again.
    table.get('e-1')!.status = RefundStatus.APPROVED;
    setPaid('900.00');
    await service.onStatusChanged({ errandId: 'e-1', status: ErrandStatus.CANCELLED });
    expect(table.size).toBe(1);
    expect(table.get('e-1')?.amountPaid).toBe('650.00');
  });

  it('opens a review only for a cancelled task the customer paid for', async () => {
    const paid = build({ paid: '500.00' });
    const opened = await paid.service.openIfPaid('e-1', RefundTrigger.PRICE_CHANGE_REJECTED);
    expect(opened?.amountPaid).toBe('500.00');

    const unpaid = build({ paid: '0' });
    expect(await unpaid.service.openIfPaid('e-1', RefundTrigger.CANCELLED_AFTER_PAYMENT)).toBeNull();

    const active = build({ paid: '500.00', status: ErrandStatus.IN_PROGRESS });
    expect(await active.service.openIfPaid('e-1', RefundTrigger.CANCELLED_AFTER_PAYMENT)).toBeNull();
  });

  it('ignores non-cancel status events', async () => {
    const { service, query } = build({ paid: '500.00' });
    await service.onStatusChanged({ errandId: 'e-1', status: ErrandStatus.COMPLETED });
    expect(query).not.toHaveBeenCalled();
  });

  it('lets an admin set 0..amountPaid', async () => {
    const full = build({ row: review(), paid: '500.00' });
    const approved = await full.service.decide('r-1', 500, 'Full refund', 'admin-1');
    expect(approved.status).toBe(RefundStatus.APPROVED);
    expect(approved.refundAmount).toBe('500.00');
    expect(approved.remainingRefundable).toBe('0.00');
    // Every review of the task is locked for the decision (row 87).
    expect(full.reviews.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { errandId: 'e-1' }, lock: { mode: 'pessimistic_write' } }),
    );

    const none = build({ row: review() });
    expect((await none.service.decide('r-1', 0, undefined, 'admin-1')).status).toBe(
      RefundStatus.NO_REFUND,
    );

    const over = build({ row: review(), paid: '500.00' });
    expect(await codeOf(over.service.decide('r-1', 500.01, undefined, 'admin-1'))).toBe(
      'refund_exceeds_amount_paid',
    );

    const twice = build({ row: review({ status: RefundStatus.APPROVED }) });
    expect(await codeOf(twice.service.decide('r-1', 1, undefined, 'admin-1'))).toBe(
      'refund_already_decided',
    );
  });

  it('caps a cancellation review at what is left after approved decreases (rows 81, 87)', async () => {
    // Paid 1650 to Nitume (fees + item + difference); a decrease refunded 150.
    const cancellation = review({ amountPaid: '1650.00' });
    const decrease = review({
      id: 'r-2',
      trigger: RefundTrigger.PRICE_CHANGE_DECREASE,
      amountPaid: '150.00',
      refundAmount: '150.00',
      status: RefundStatus.REFUNDED,
    });
    const over = build({ row: cancellation, siblings: [decrease], paid: '1650.00' });
    const err = await over.service.decide('r-1', 1600, undefined, 'admin-1').catch((e: unknown) => e);
    expect((err as ApiError).code).toBe('refund_exceeds_remaining');
    expect((err as ApiError).getStatus()).toBe(400);
    expect((err as ApiError).getResponse()).toMatchObject({
      refundCeiling: '1500.00',
      alreadyRefunded: '150.00',
      totalPaidToNitume: '1650.00',
    });

    const ok = build({ row: review({ amountPaid: '1650.00' }), siblings: [decrease], paid: '1650.00' });
    const decided = await ok.service.decide('r-1', 1500, undefined, 'admin-1');
    expect(decided).toMatchObject({
      status: RefundStatus.APPROVED,
      refundAmount: '1500.00',
      alreadyRefunded: '150.00',
      remainingRefundable: '0.00',
      refundCeiling: null,
    });
  });

  it('caps a decrease review once a cancellation refund used up the payment (row 87)', async () => {
    const cancellation = review({
      id: 'r-1',
      amountPaid: '1000.00',
      refundAmount: '950.00',
      status: RefundStatus.APPROVED,
    });
    const decreaseRow = () =>
      review({ id: 'r-2', trigger: RefundTrigger.PRICE_CHANGE_DECREASE, amountPaid: '100.00' });
    const b = build({ row: decreaseRow(), siblings: [cancellation], paid: '1000.00' });
    expect(await codeOf(b.service.decide('r-2', 100, undefined, 'admin-1'))).toBe(
      'refund_exceeds_remaining',
    );
    const ok = build({ row: decreaseRow(), siblings: [cancellation], paid: '1000.00' });
    expect((await ok.service.decide('r-2', 50, undefined, 'admin-1')).remainingRefundable).toBe('0.00');
  });

  it('ignores pending and no_refund siblings in the ceiling (row 87)', () => {
    const pos = refundPositionOf(review({ amountPaid: '500.00' }), 500, [
      review({ id: 'r-2', status: RefundStatus.PENDING_REVIEW, refundAmount: null }),
      review({ id: 'r-3', status: RefundStatus.NO_REFUND, refundAmount: '0.00' }),
    ]);
    expect(pos).toEqual({
      totalPaidToNitume: '500.00',
      alreadyRefunded: '0.00',
      remainingRefundable: '500.00',
      refundCeiling: '500.00',
    });
  });

  it('never reports a negative ceiling or remaining amount', () => {
    const pos = refundPositionOf(review({ amountPaid: '500.00' }), 100, [
      review({ id: 'r-2', status: RefundStatus.REFUNDED, refundAmount: '300.00' }),
    ]);
    expect(pos.refundCeiling).toBe('0.00');
    expect(pos.remainingRefundable).toBe('0.00');
  });

  it('marks only approved refunds as paid out manually', async () => {
    const ok = build({ row: review({ status: RefundStatus.APPROVED, refundAmount: '200.00' }) });
    const paid = await ok.service.markPaid('r-1', 'QJK12AB34C', 'admin-1');
    expect(paid.status).toBe(RefundStatus.REFUNDED);
    expect(paid.payoutReference).toBe('QJK12AB34C');

    const pending = build({ row: review() });
    expect(await codeOf(pending.service.markPaid('r-1', 'QJK12AB34C', 'admin-1'))).toBe(
      'refund_not_approved',
    );

    // Row 82: the receipt cannot be edited after refunded.
    const done = build({
      row: review({ status: RefundStatus.REFUNDED, refundAmount: '200.00', payoutReference: 'QJK12AB34C' }),
    });
    const err = await done.service.markPaid('r-1', 'QZZ99XY88W', 'admin-1').catch((e: unknown) => e);
    expect((err as ApiError).code).toBe('refund_payout_locked');
    expect((err as ApiError).getStatus()).toBe(409);
    expect(done.reviews.save).not.toHaveBeenCalled();
  });
});
