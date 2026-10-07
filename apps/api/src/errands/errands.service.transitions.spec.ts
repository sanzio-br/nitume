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
  return { service, errand };
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

  it('requires a 20+ character rationale', async () => {
    const { service } = build(ErrandStatus.DISPUTED);
    await expect(
      service.resolveDispute('e-1', 'runner_favourable', 'too short', admin as never),
    ).rejects.toBeInstanceOf(ConflictException);
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
