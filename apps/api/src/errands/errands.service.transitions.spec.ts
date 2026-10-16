import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../common/api-error';
import { ErrandStatus, StatusHistoryActor, UserRole } from '../common/enums';
import { CustomerProfile } from '../customers/customer-profile.entity';
import { Errand } from './errand.entity';
import { ErrandAssignment } from './errand-assignment.entity';
import { ErrandStatusHistory } from './errand-status-history.entity';
import { TransitionGuard } from './errand-state-machine';
import { ErrandsService } from './errands.service';

const build = (status: ErrandStatus) => {
  const errand = { id: 'e-1', customerId: 'cust-1', status } as Errand;
  const repos = new Map<unknown, unknown>([
    [Errand, { findOne: vi.fn(() => Promise.resolve(errand)), save: vi.fn((e: Errand) => Promise.resolve(e)) }],
    [CustomerProfile, { findOne: vi.fn(() => Promise.resolve({ id: 'cust-1' })) }],
    [ErrandAssignment, { update: vi.fn(() => Promise.resolve({ affected: 0 })) }],
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

describe('ErrandsService confirmation hooks (rows 104, 107)', () => {
  it('runs inside the COMPLETED -> CONFIRMED transaction, and only there', async () => {
    const { service, manager } = build(ErrandStatus.COMPLETED);
    const hook = vi.fn(() => Promise.resolve());
    service.onConfirmed(hook);
    await service.transition('e-1', ErrandStatus.CONFIRMED, { type: StatusHistoryActor.SYSTEM });
    expect(hook).toHaveBeenCalledWith(manager, {
      errandId: 'e-1',
      from: ErrandStatus.COMPLETED,
      actor: StatusHistoryActor.SYSTEM,
    });

    for (const [from, to] of [
      [ErrandStatus.AWAITING_CUSTOMER, ErrandStatus.COMPLETED],
      [ErrandStatus.CONFIRMED, ErrandStatus.SETTLED],
      [ErrandStatus.RUNNER_EN_ROUTE, ErrandStatus.FAILED],
    ] as const) {
      const other = build(from);
      const h = vi.fn(() => Promise.resolve());
      other.service.onConfirmed(h);
      await other.service
        .transition('e-1', to, { type: StatusHistoryActor.SYSTEM })
        .catch(() => undefined);
      expect(h).not.toHaveBeenCalled();
    }
  });

  it('rolls CONFIRMED back (no event) when a hook throws', async () => {
    const { service, emit } = build(ErrandStatus.COMPLETED);
    service.onConfirmed(() => Promise.reject(new Error('ledger failed')));
    await expect(
      service.transition('e-1', ErrandStatus.CONFIRMED, { type: StatusHistoryActor.SYSTEM }),
    ).rejects.toThrow('ledger failed');
    await new Promise((r) => setImmediate(r));
    expect(emit).not.toHaveBeenCalled();
  });
});

describe('ErrandsService offer deadline (row 141)', () => {
  const runner = { type: StatusHistoryActor.RUNNER, id: 'rp-1' };

  const withOffer = (offerExpiresAt: Date | null) => {
    const built = build(ErrandStatus.RUNNER_ASSIGNED);
    const offer = { id: 'a-1', errandId: 'e-1', runnerProfileId: 'rp-1', status: 'assigned', offerExpiresAt };
    const qb = { where: vi.fn(), andWhere: vi.fn(), getOne: vi.fn(() => Promise.resolve(offer)) };
    qb.where.mockReturnValue(qb);
    qb.andWhere.mockReturnValue(qb);
    const repo = {
      createQueryBuilder: vi.fn(() => qb),
      findOne: vi.fn(() => Promise.resolve(offer)),
      update: vi.fn((_id: string, patch: object) => Promise.resolve(Object.assign(offer, patch))),
    };
    const original = built.manager.getRepository;
    built.manager.getRepository = (entity: unknown) =>
      entity === ErrandAssignment ? repo : original(entity);
    return { ...built, offer, repo };
  };

  it('accepts (RUNNER_ASSIGNED -> RUNNER_EN_ROUTE) before the deadline and marks the assignment accepted', async () => {
    const { service, errand, offer } = withOffer(new Date(Date.now() + 60_000));
    await service.transition('e-1', ErrandStatus.RUNNER_EN_ROUTE, runner);
    expect(errand.status).toBe(ErrandStatus.RUNNER_EN_ROUTE);
    expect(offer).toMatchObject({ status: 'accepted', decidedAt: expect.any(Date) });
  });

  it('reads the errand under a row lock so concurrent transitions serialise (reviewer B1)', async () => {
    const { service, manager } = withOffer(new Date(Date.now() + 60_000));
    const errands = manager.getRepository(Errand) as { findOne: ReturnType<typeof vi.fn> };
    await service.transition('e-1', ErrandStatus.RUNNER_EN_ROUTE, runner);
    expect(errands.findOne).toHaveBeenCalledWith({ where: { id: 'e-1' }, lock: { mode: 'pessimistic_write' } });
  });

  it('refuses the accept after the deadline with 409 offer_expired', async () => {
    const deadline = new Date(Date.now() - 1_000);
    const { service, errand } = withOffer(deadline);
    const err = await service.transition('e-1', ErrandStatus.RUNNER_EN_ROUTE, runner).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 409, code: 'offer_expired' });
    expect((err as ApiError).getResponse()).toMatchObject({ offerExpiresAt: deadline.toISOString() });
    expect(errand.status).toBe(ErrandStatus.RUNNER_ASSIGNED);
  });

  it('an assignment without a deadline (made before row 141) never lapses', async () => {
    const { service, errand } = withOffer(null);
    await service.transition('e-1', ErrandStatus.RUNNER_EN_ROUTE, runner);
    expect(errand.status).toBe(ErrandStatus.RUNNER_EN_ROUTE);
  });

  it('still answers 409 offer_expired once the sweep has marked the offer expired (row 157)', async () => {
    const deadline = new Date(Date.now() - 60_000);
    const { service, errand, offer } = withOffer(deadline);
    offer.status = 'expired';
    const err = await service.transition('e-1', ErrandStatus.RUNNER_EN_ROUTE, runner).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 409, code: 'offer_expired' });
    expect((err as ApiError).getResponse()).toMatchObject({ offerExpiresAt: deadline.toISOString() });
    expect(errand.status).toBe(ErrandStatus.RUNNER_ASSIGNED);
  });
});

describe('ErrandsService.expireLapsedOffers re-checks under the lock (rows 141, 157)', () => {
  const now = new Date('2026-10-16T10:00:00Z');
  const past = new Date('2026-10-16T09:59:00Z');

  const sweep = (state: { status: ErrandStatus; offer: { status: string; offerExpiresAt: Date | null } | null }) => {
    const errand = { id: 'e-1', reference: 'NT-1', status: state.status } as Errand;
    const offer = state.offer ? { id: 'a-1', errandId: 'e-1', runnerProfileId: 'rp-1', ...state.offer } : null;
    const assignmentRepo = {
      findOne: vi.fn(() => Promise.resolve(offer)),
      update: vi.fn(() => Promise.resolve()),
    };
    const history = { create: vi.fn((r: object) => r), save: vi.fn((r: object) => Promise.resolve(r)) };
    const errandRepo = {
      findOne: vi.fn(() => Promise.resolve(errand)),
      save: vi.fn((e: Errand) => Promise.resolve(e)),
    };
    const manager = {
      getRepository: (entity: unknown) =>
        entity === Errand ? errandRepo : entity === ErrandAssignment ? assignmentRepo : history,
    };
    const qb: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const m of ['select', 'innerJoin', 'where', 'andWhere', 'orderBy', 'limit']) {
      qb[m] = vi.fn(() => qb);
    }
    qb.getRawMany = vi.fn(() => Promise.resolve([{ id: 'e-1' }]));
    const emit = vi.fn();
    const service = new ErrandsService(
      { transaction: vi.fn((cb: (m: unknown) => unknown) => cb(manager)) } as never,
      { createQueryBuilder: vi.fn(() => qb) } as never,
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
    return { service, errand, assignmentRepo, errandRepo, history, emit };
  };

  it('expires a lapsed open offer: assignment expired, task stays RUNNER_ASSIGNED, runner loses access (row 157)', async () => {
    const { service, errand, assignmentRepo, errandRepo, history, emit } = sweep({
      status: ErrandStatus.RUNNER_ASSIGNED,
      offer: { status: 'assigned', offerExpiresAt: past },
    });
    expect(await service.expireLapsedOffers(now)).toEqual(['e-1']);
    expect(errandRepo.findOne).toHaveBeenCalledWith({ where: { id: 'e-1' }, lock: { mode: 'pessimistic_write' } });
    expect(assignmentRepo.update).toHaveBeenCalledWith('a-1', { status: 'expired', decidedAt: now });
    expect(errand.status).toBe(ErrandStatus.RUNNER_ASSIGNED);
    expect(errandRepo.save).not.toHaveBeenCalled();
    expect(history.save).not.toHaveBeenCalled();
    await new Promise((r) => setImmediate(r));
    expect(emit).toHaveBeenCalledWith('errand.access_changed', { errandId: 'e-1' });
    expect(emit).toHaveBeenCalledWith('assignment.expired', {
      errandId: 'e-1',
      reference: 'NT-1',
      assignmentId: 'a-1',
      runnerProfileId: 'rp-1',
      offerExpiresAt: past.toISOString(),
    });
    expect(emit).not.toHaveBeenCalledWith('errand.status_changed', expect.anything());
  });

  it.each([
    ['the task moved on (accepted)', ErrandStatus.RUNNER_EN_ROUTE, { status: 'accepted', offerExpiresAt: past }],
    ['the task was cancelled meanwhile', ErrandStatus.CANCELLED, { status: 'assigned', offerExpiresAt: past }],
    ['the offer was declined (no open assignment)', ErrandStatus.RUNNER_ASSIGNED, null],
    ['the offer was accepted but the status not yet read', ErrandStatus.RUNNER_ASSIGNED, { status: 'accepted', offerExpiresAt: past }],
    ['the deadline was pushed out (reassigned)', ErrandStatus.RUNNER_ASSIGNED, {
      status: 'assigned',
      offerExpiresAt: new Date('2026-10-16T10:10:00Z'),
    }],
    ['the offer has no deadline', ErrandStatus.RUNNER_ASSIGNED, { status: 'assigned', offerExpiresAt: null }],
  ])('skips when %s', async (_label, status, offer) => {
    const { service, errand, assignmentRepo } = sweep({ status, offer });
    expect(await service.expireLapsedOffers(now)).toEqual([]);
    expect(assignmentRepo.update).not.toHaveBeenCalled();
    expect(errand.status).toBe(status);
  });
});

describe('ErrandsService closes an open offer when the task ends before an accept (reviewer B1, row 183)', () => {
  it.each([ErrandStatus.CANCELLED, ErrandStatus.EXPIRED])('RUNNER_ASSIGNED -> %s marks the open offer expired', async (to) => {
    const built = build(ErrandStatus.RUNNER_ASSIGNED);
    const assignments = built.manager.getRepository(ErrandAssignment) as { update: ReturnType<typeof vi.fn> };
    const actor = to === ErrandStatus.CANCELLED ? { type: StatusHistoryActor.ADMIN, id: 'admin-1' } : { type: StatusHistoryActor.SYSTEM };
    await built.service.transition('e-1', to, actor);
    expect(assignments.update).toHaveBeenCalledWith(
      { errandId: 'e-1', status: 'assigned' },
      { status: 'expired', decidedAt: expect.any(Date) },
    );
  });
});
