import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../common/api-error';
import { ErrandStatus } from '../common/enums';
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
  const reviews = {
    findOne: vi.fn(() => Promise.resolve(opts.row ?? null)),
    create: vi.fn((r: object) => Object.assign(new RefundReview(), r)),
    save: vi.fn((r: RefundReview) => Promise.resolve(r)),
  };
  const qb = {
    innerJoin: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    getRawOne: vi.fn(() => Promise.resolve({ total: opts.paid ?? '0' })),
  };
  const transactions = { createQueryBuilder: vi.fn(() => qb) };
  const errands = {
    getById: vi.fn(() => Promise.resolve({ id: 'e-1', status: opts.status ?? ErrandStatus.CANCELLED })),
  };
  const service = new RefundsService(reviews as never, {} as never, transactions as never, errands as never);
  return { service, reviews };
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
    const { service, reviews } = build({ paid: '500.00' });
    await service.onStatusChanged({ errandId: 'e-1', status: ErrandStatus.COMPLETED });
    expect(reviews.save).not.toHaveBeenCalled();
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
