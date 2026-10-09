import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../common/api-error';
import { ErrandStatus } from '../common/enums';
import { TransitionGuard } from '../errands/errand-state-machine';
import { RefundReview, RefundStatus, RefundTrigger } from './refund-review.entity';
import { RefundsService, triggerFor } from './refunds.service';

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

const build = (opts: { row?: RefundReview | null; status?: ErrandStatus; paid?: string } = {}) => {
  // In-memory refund_reviews table keyed by errandId (the unique index).
  const table = new Map<string, RefundReview>();
  const reviews = {
    findOne: vi.fn(({ where }: { where: { id?: string; errandId?: string } }) =>
      Promise.resolve(where.errandId ? (table.get(where.errandId) ?? null) : (opts.row ?? null)),
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
    getRawOne: vi.fn(() => Promise.resolve({ total: opts.paid ?? '0' })),
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
    const full = build({ row: review() });
    const approved = await full.service.decide('r-1', 500, 'Full refund', 'admin-1');
    expect(approved.status).toBe(RefundStatus.APPROVED);
    expect(approved.refundAmount).toBe('500.00');

    const none = build({ row: review() });
    expect((await none.service.decide('r-1', 0, undefined, 'admin-1')).status).toBe(
      RefundStatus.NO_REFUND,
    );

    const over = build({ row: review() });
    expect(await codeOf(over.service.decide('r-1', 500.01, undefined, 'admin-1'))).toBe(
      'refund_exceeds_amount_paid',
    );

    const twice = build({ row: review({ status: RefundStatus.APPROVED }) });
    expect(await codeOf(twice.service.decide('r-1', 1, undefined, 'admin-1'))).toBe(
      'refund_already_decided',
    );
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
  });
});
