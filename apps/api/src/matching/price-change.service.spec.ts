import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PriceChangeStatus, UserRole } from '../common/enums';
import { PriceChangeService } from './price-change.service';

const build = (getById: () => Promise<unknown>) => {
  const requests = { find: vi.fn(() => Promise.resolve([{ id: 'pc-1' }])) };
  const errandService = { getById: vi.fn(getById) };
  const service = new PriceChangeService(
    requests as never,
    {} as never,
    {} as never,
    {} as never,
    errandService as never,
  );
  return { service, requests, errandService };
};

const customer = { userId: 'user-1', role: UserRole.CUSTOMER };

describe('PriceChangeService.listForErrand (A-8)', () => {
  it('filters by status, newest first, after the errand access check', async () => {
    const { service, requests, errandService } = build(() => Promise.resolve({}));

    const rows = await service.listForErrand('e-1', customer, PriceChangeStatus.REQUESTED);

    expect(errandService.getById).toHaveBeenCalledWith('e-1', customer);
    expect(requests.find).toHaveBeenCalledWith({
      where: { errandId: 'e-1', status: PriceChangeStatus.REQUESTED },
      order: { createdAt: 'DESC' },
    });
    expect(rows).toEqual([{ id: 'pc-1' }]);
  });

  it('lists every request when no status is given', async () => {
    const { service, requests } = build(() => Promise.resolve({}));
    await service.listForErrand('e-1', customer);
    expect(requests.find).toHaveBeenCalledWith({
      where: { errandId: 'e-1' },
      order: { createdAt: 'DESC' },
    });
  });

  it('propagates the access denial and does not query', async () => {
    const { service, requests } = build(() =>
      Promise.reject(new ForbiddenException('nope')),
    );
    await expect(service.listForErrand('e-1', customer)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(requests.find).not.toHaveBeenCalled();
  });
});
