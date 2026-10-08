import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { UserRole } from '../common/enums';
import { RatingsService } from './ratings.service';

const build = (getById: () => Promise<unknown>) => {
  const ratings = { findOne: vi.fn(() => Promise.resolve({ id: 'r-1', score: 5 })) };
  const errandService = { getById: vi.fn(getById) };
  const service = new RatingsService(
    ratings as never,
    {} as never,
    {} as never,
    {} as never,
    errandService as never,
  );
  return { service, ratings, errandService };
};

const customer = { userId: 'u-1', role: UserRole.CUSTOMER };

describe('RatingsService.getForErrand (row 28)', () => {
  it('checks errand access with the caller before returning the rating', async () => {
    const { service, errandService } = build(() => Promise.resolve({ id: 'e-1' }));
    await expect(service.getForErrand('e-1', customer)).resolves.toEqual({ id: 'r-1', score: 5 });
    expect(errandService.getById).toHaveBeenCalledWith('e-1', customer);
  });

  it('refuses callers who cannot view the errand', async () => {
    const { service, ratings } = build(() =>
      Promise.reject(new ForbiddenException('You do not have access to this errand')),
    );
    await expect(service.getForErrand('e-1', customer)).rejects.toBeInstanceOf(ForbiddenException);
    expect(ratings.findOne).not.toHaveBeenCalled();
  });

  it('404s for an unknown errand', async () => {
    const { service } = build(() => Promise.reject(new NotFoundException('Errand not found')));
    await expect(service.getForErrand('e-x', customer)).rejects.toBeInstanceOf(NotFoundException);
  });
});
