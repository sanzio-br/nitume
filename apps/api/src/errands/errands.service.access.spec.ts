import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AssignmentStatus, ErrandStatus } from '../common/enums';
import { ErrandsService } from './errands.service';

/**
 * BOARD rows 27 / 65: a runner sees an errand only through its CURRENT
 * assignment (newest assigned/accepted row), never through a past one.
 */
const build = (current: { runnerProfileId: string } | null) => {
  const errandsRepo = {
    findOne: vi.fn(() =>
      Promise.resolve({ id: 'e-1', customerId: 'cust-1', status: ErrandStatus.IN_PROGRESS }),
    ),
  };
  const assignmentsRepo = {
    findOne: vi.fn(() =>
      Promise.resolve(current ? { id: 'a-2', status: AssignmentStatus.ACCEPTED, ...current } : null),
    ),
  };
  const runnerProfiles = {
    findOne: vi.fn(({ where }: { where: { userId: string } }) =>
      Promise.resolve({ id: `profile-of-${where.userId}`, userId: where.userId }),
    ),
  };
  const service = new ErrandsService(
    {} as never,
    errandsRepo as never,
    {} as never,
    {} as never,
    {} as never,
    assignmentsRepo as never,
    {} as never,
    runnerProfiles as never,
    { emit: vi.fn() } as never,
    {} as never,
    {} as never,
  );
  return { service, assignmentsRepo };
};

describe('ErrandsService runner access (rows 27, 65)', () => {
  it('lets the runner on the current assignment view the errand', async () => {
    const { service, assignmentsRepo } = build({ runnerProfileId: 'profile-of-r-1' });
    await expect(service.getById('e-1', { role: 'runner', userId: 'r-1' })).resolves.toMatchObject({
      id: 'e-1',
    });
    // Looks up the newest active assignment, not any historical row.
    expect(assignmentsRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ order: { createdAt: 'DESC' } }),
    );
  });

  it('refuses a runner whose assignment is no longer the current one', async () => {
    const { service } = build({ runnerProfileId: 'profile-of-r-2' });
    await expect(service.getById('e-1', { role: 'runner', userId: 'r-1' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.isCurrentRunner('e-1', 'r-1')).resolves.toBe(false);
  });

  it('refuses every runner when the errand has no active assignment', async () => {
    const { service } = build(null);
    await expect(service.isCurrentRunner('e-1', 'r-1')).resolves.toBe(false);
  });
});
