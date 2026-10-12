import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../common/api-error';
import { ErrandStatus, StatusHistoryActor, UserRole } from '../common/enums';
import { CustomerProfile } from '../customers/customer-profile.entity';
import { Errand } from './errand.entity';
import { ErrandStatusHistory } from './errand-status-history.entity';
import { TransitionGuard } from './errand-state-machine';
import { ErrandsService } from './errands.service';

const build = (status: ErrandStatus) => {
  const errand = { id: 'e-1', customerId: 'cust-1', status } as Errand;
  const repos = new Map<unknown, unknown>([
    [Errand, { findOne: vi.fn(() => Promise.resolve(errand)), save: vi.fn((e: Errand) => Promise.resolve(e)) }],
    [CustomerProfile, { findOne: vi.fn(() => Promise.resolve({ id: 'cust-1' })) }],
    [
      ErrandStatusHistory,
      { create: vi.fn((r: object) => r), save: vi.fn((r: object) => Promise.resolve(r)) },
    ],
  ]);
  const manager = { getRepository: (entity: unknown) => repos.get(entity) };
  const dataSource = { transaction: vi.fn((cb: (m: unknown) => unknown) => cb(manager)) };
  const emit = vi.fn();
  const service = new ErrandsService(
    dataSource as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { emit } as never,
    {} as never,
    {} as never,
  );
  return { service, errand, emit, dataSource, manager };
};

const customer = { type: StatusHistoryActor.CUSTOMER, id: 'user-1' };
const subject = { role: UserRole.CUSTOMER, userId: 'user-1' };

describe('ErrandsService guarded transitions', () => {
  it('refuses IN_PROGRESS -> CANCELLED without the price-change guard', async () => {
    const { service } = build(ErrandStatus.IN_PROGRESS);
    const err = await service
      .transition('e-1', ErrandStatus.CANCELLED, customer, undefined, subject)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('transition_requires_price_change_rejection');
  });

  it('allows it when the price-change rejection flow passes the guard', async () => {
    const { service, errand } = build(ErrandStatus.IN_PROGRESS);
    await service.transition(
      'e-1',
      ErrandStatus.CANCELLED,
      customer,
      'Price change rejected',
      subject,
      TransitionGuard.PRICE_CHANGE_REJECTION,
    );
    expect(errand.status).toBe(ErrandStatus.CANCELLED);
  });

  it('409 illegal_transition with from/to on an impossible move (N-8)', async () => {
    const { service } = build(ErrandStatus.DRAFT);
    await expect(
      service.transition('e-1', ErrandStatus.SETTLED, customer, undefined, subject),
    ).rejects.toMatchObject({ status: 409, code: 'illegal_transition' });
  });

  it('refuses a customer COMPLETED -> CONFIRMED (system-only now)', async () => {
    const { service } = build(ErrandStatus.COMPLETED);
    await expect(
      service.transition('e-1', ErrandStatus.CONFIRMED, customer, undefined, subject),
    ).rejects.toThrow(/cannot perform/);
  });
});

describe('ErrandsService.resolveDispute', () => {
  const admin = { userId: 'admin-1', role: UserRole.ADMIN, phone: '+254700000000' };
  const rationale = 'Evidence shows the runner completed the task.';

  it('runner-favourable resolves DISPUTED -> COMPLETED', async () => {
    const { service, errand } = build(ErrandStatus.DISPUTED);
    await service.resolveDispute('e-1', 'runner_favourable', rationale, admin as never);
    expect(errand.status).toBe(ErrandStatus.COMPLETED);
  });

  it('customer-favourable resolves DISPUTED -> CANCELLED', async () => {
    const { service, errand } = build(ErrandStatus.DISPUTED);
    await service.resolveDispute('e-1', 'customer_favourable', rationale, admin as never);
    expect(errand.status).toBe(ErrandStatus.CANCELLED);
  });

  it('runs the dispute-resolution hooks in the same transaction (N-6)', async () => {
    const { service, manager } = build(ErrandStatus.DISPUTED);
    const hook = vi.fn(() => Promise.resolve());
    service.onDisputeResolved(hook);
    await service.resolveDispute('e-1', 'customer_favourable', `  ${rationale} `, admin as never);
    expect(hook).toHaveBeenCalledWith(manager, {
      errandId: 'e-1',
      verdict: 'customer_favourable',
      rationale,
      adminUserId: 'admin-1',
    });
  });

  it('409 errand_not_disputed outside DISPUTED (N-8)', async () => {
    const { service } = build(ErrandStatus.COMPLETED);
    await expect(
      service.resolveDispute('e-1', 'runner_favourable', rationale, admin as never),
    ).rejects.toMatchObject({ status: 409, code: 'errand_not_disputed' });
  });

  it('requires a 20+ character rationale', async () => {
    const { service } = build(ErrandStatus.DISPUTED);
    await expect(
      service.resolveDispute('e-1', 'runner_favourable', 'too short', admin as never),
    ).rejects.toMatchObject({ status: 409, code: 'rationale_too_short' });
  });
});

describe('ErrandsService.confirmPastDisputeWindow', () => {
  it('moves due COMPLETED errands to CONFIRMED as the system and skips conflicts', async () => {
    const qb = {
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      getRawMany: vi.fn(() => Promise.resolve([{ id: 'e-1' }, { id: 'e-2' }])),
    };
    const config = { get: vi.fn(() => 48) };
    const service = new ErrandsService(
      {} as never,
      { createQueryBuilder: () => qb } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { emit: vi.fn() } as never,
      {} as never,
      {} as never,
      config as never,
    );
    const transition = vi
      .spyOn(service, 'transition')
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(new ConflictException('Illegal status transition'));
    const now = new Date('2026-10-07T12:00:00Z');

    const confirmed = await service.confirmPastDisputeWindow(now);

    expect(confirmed).toEqual(['e-1']);
    expect(transition).toHaveBeenCalledWith(
      'e-1',
      ErrandStatus.CONFIRMED,
      { type: StatusHistoryActor.SYSTEM },
      'Dispute window of 48h passed',
    );
    expect(qb.andWhere).toHaveBeenCalledWith(expect.any(String), {
      cutoff: new Date('2026-10-05T12:00:00Z'),
    });
  });
});

describe('ErrandsService status events', () => {
  const tick = () => new Promise((r) => setImmediate(r));

  it('emits errand.status_changed only after the transaction commits', async () => {
    const { service, emit } = build(ErrandStatus.AWAITING_CUSTOMER);
    await service.transition('e-1', ErrandStatus.COMPLETED, customer, undefined, subject);
    await tick();
    expect(emit).toHaveBeenCalledWith('errand.status_changed', {
      errandId: 'e-1',
      status: ErrandStatus.COMPLETED,
      from: ErrandStatus.AWAITING_CUSTOMER,
      actor: StatusHistoryActor.CUSTOMER,
    });
  });

  it('drops the event when the transaction rolls back', async () => {
    const { service, emit, dataSource } = build(ErrandStatus.AWAITING_CUSTOMER);
    const inner = dataSource.transaction.getMockImplementation()!;
    dataSource.transaction.mockImplementationOnce(async (cb: (m: unknown) => unknown) => {
      await inner(cb);
      throw new Error('rollback');
    });
    await expect(
      service.transition('e-1', ErrandStatus.COMPLETED, customer, undefined, subject),
    ).rejects.toThrow('rollback');
    await tick();
    expect(emit).not.toHaveBeenCalled();
  });
});

describe('ErrandsService cancellation hooks', () => {
  const admin = { userId: 'admin-1', role: UserRole.ADMIN, phone: '+254700000000' };
  const rationale = 'Evidence shows the customer was not served.';

  it('runs on every CANCELLED transition with the transaction manager', async () => {
    const dispute = build(ErrandStatus.DISPUTED);
    const hook = vi.fn(() => Promise.resolve());
    dispute.service.onCancelled(hook);
    await dispute.service.resolveDispute('e-1', 'customer_favourable', rationale, admin as never);
    expect(hook).toHaveBeenCalledWith(dispute.manager, {
      errandId: 'e-1',
      from: ErrandStatus.DISPUTED,
      actor: StatusHistoryActor.ADMIN,
      guard: undefined,
    });

    const priceChange = build(ErrandStatus.IN_PROGRESS);
    const pcHook = vi.fn(() => Promise.resolve());
    priceChange.service.onCancelled(pcHook);
    await priceChange.service.transitionWith(
      'e-1',
      ErrandStatus.CANCELLED,
      customer,
      'Price change rejected',
      subject,
      () => Promise.resolve(null),
      TransitionGuard.PRICE_CHANGE_REJECTION,
    );
    expect(pcHook).toHaveBeenCalledWith(priceChange.manager, expect.objectContaining({
      from: ErrandStatus.IN_PROGRESS,
      guard: TransitionGuard.PRICE_CHANGE_REJECTION,
    }));

    const adminCancel = build(ErrandStatus.RUNNER_ASSIGNED);
    const acHook = vi.fn(() => Promise.resolve());
    adminCancel.service.onCancelled(acHook);
    await adminCancel.service.transition('e-1', ErrandStatus.CANCELLED, {
      type: StatusHistoryActor.ADMIN,
      id: 'admin-1',
    });
    expect(acHook).toHaveBeenCalledTimes(1);
  });

  it('does not run for other transitions', async () => {
    const { service } = build(ErrandStatus.DISPUTED);
    const hook = vi.fn(() => Promise.resolve());
    service.onCancelled(hook);
    await service.resolveDispute('e-1', 'runner_favourable', rationale, admin as never);
    expect(hook).not.toHaveBeenCalled();
  });

  it('fails the cancellation (no event) when a hook throws', async () => {
    const { service, emit } = build(ErrandStatus.DISPUTED);
    service.onCancelled(() => Promise.reject(new Error('refund review failed')));
    await expect(
      service.resolveDispute('e-1', 'customer_favourable', rationale, admin as never),
    ).rejects.toThrow('refund review failed');
    await new Promise((r) => setImmediate(r));
    expect(emit).not.toHaveBeenCalled();
  });
});

describe('ErrandsService termination hooks (row 102)', () => {
  it('runs on CANCELLED, EXPIRED and FAILED with the target status', async () => {
    const expired = build(ErrandStatus.RUNNER_ASSIGNED);
    const hook = vi.fn(() => Promise.resolve());
    const cancelOnly = vi.fn(() => Promise.resolve());
    expired.service.onTerminated(hook);
    expired.service.onCancelled(cancelOnly);
    await expired.service.transition('e-1', ErrandStatus.EXPIRED, { type: StatusHistoryActor.SYSTEM });
    expect(hook).toHaveBeenCalledWith(expired.manager, {
      errandId: 'e-1',
      from: ErrandStatus.RUNNER_ASSIGNED,
      to: ErrandStatus.EXPIRED,
      actor: StatusHistoryActor.SYSTEM,
      guard: undefined,
    });
    // onCancelled stays CANCELLED-only.
    expect(cancelOnly).not.toHaveBeenCalled();

    const failed = build(ErrandStatus.RUNNER_EN_ROUTE);
    const fHook = vi.fn(() => Promise.resolve());
    failed.service.onTerminated(fHook);
    await failed.service.transition('e-1', ErrandStatus.FAILED, { type: StatusHistoryActor.SYSTEM });
    expect(fHook).toHaveBeenCalledWith(
      failed.manager,
      expect.objectContaining({ from: ErrandStatus.RUNNER_EN_ROUTE, to: ErrandStatus.FAILED }),
    );
  });

  it('does not run for non-terminal transitions', async () => {
    const { service } = build(ErrandStatus.RUNNER_ASSIGNED);
    const hook = vi.fn(() => Promise.resolve());
    service.onTerminated(hook);
    await service.transition('e-1', ErrandStatus.RUNNER_EN_ROUTE, { type: StatusHistoryActor.SYSTEM }).catch(() => undefined);
    expect(hook).not.toHaveBeenCalled();
  });

  it('rolls the EXPIRED transition back (no event) when a hook throws', async () => {
    const { service, emit } = build(ErrandStatus.RUNNER_ASSIGNED);
    service.onTerminated(() => Promise.reject(new Error('refund review failed')));
    await expect(
      service.transition('e-1', ErrandStatus.EXPIRED, { type: StatusHistoryActor.SYSTEM }),
    ).rejects.toThrow('refund review failed');
    await new Promise((r) => setImmediate(r));
    expect(emit).not.toHaveBeenCalled();
  });
});
