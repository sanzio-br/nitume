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
    errandService as never,
    { emit: vi.fn() } as never,
    {} as never,
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

describe('PriceChangeService.request domain event (A-2)', () => {
  it('emits price_change.requested after saving', async () => {
    const emit = vi.fn();
    const createdAt = new Date('2026-10-07T09:00:00Z');
    const requests = {
      findOne: vi.fn(() => Promise.resolve(null)),
      create: vi.fn((row: object) => row),
      save: vi.fn((row: object) => Promise.resolve({ id: 'pc-9', createdAt, ...row })),
    };
    const errands = {
      findOne: vi.fn(() =>
        Promise.resolve({ id: 'e-1', status: 'IN_PROGRESS', quotedPrice: '900.00', budget: '500.00' }),
      ),
    };
    const service = new PriceChangeService(
      requests as never,
      errands as never,
      {} as never,
      { emit } as never,
      {} as never,
    );

    await service.request('e-1', { toPrice: 650, reason: 'Price went up' }, {
      userId: 'admin-1',
      role: UserRole.ADMIN,
    });
    await new Promise((r) => setImmediate(r));

    expect(emit).toHaveBeenCalledWith('price_change.requested', {
      errandId: 'e-1',
      requestId: 'pc-9',
      fromPrice: '500.00',
      toPrice: '650.00',
      reason: 'Price went up',
      createdAt: '2026-10-07T09:00:00.000Z',
    });
  });
});

describe('PriceChangeService decisions (owner Q8)', () => {
  const customerActor = { userId: 'user-1', role: UserRole.CUSTOMER };
  const pending = {
    id: 'pc-1',
    errandId: 'e-1',
    fromPrice: '500.00',
    toPrice: '650.00',
    status: PriceChangeStatus.REQUESTED,
  };

  const setup = (status: string) => {
    // Stateful request row; findOne returns a copy like a fresh DB read.
    const row = { ...pending } as Record<string, unknown>;
    const requests = {
      findOne: vi.fn(() => Promise.resolve({ ...row })),
      save: vi.fn((r: Record<string, unknown>) => {
        Object.assign(row, r);
        return Promise.resolve(r);
      }),
      manager: {} as { transaction: (fn: (m: unknown) => Promise<unknown>) => Promise<unknown> },
    };
    const errands = {
      findOne: vi.fn(() => Promise.resolve({ id: 'e-1', customerId: 'cust-1', status })),
      update: vi.fn(() => Promise.resolve({})),
    };
    const manager = {
      getRepository: (entity: { name: string }) =>
        entity.name === 'Errand' ? errands : requests,
    };
    // Serialises transactions the way the row locks do.
    let lock: Promise<unknown> = Promise.resolve();
    requests.manager.transaction = vi.fn((fn) => {
      const run = lock.then(async () => {
        await new Promise((r) => setImmediate(r));
        return fn(manager);
      });
      lock = run.catch(() => undefined);
      return run;
    });
    const errandService = {
      getCustomerProfileId: vi.fn(() => Promise.resolve('cust-1')),
      transitionWith: vi.fn(
        (_id: string, _to: string, _a: unknown, _n: string, _s: unknown, within: (m: unknown) => Promise<unknown>) =>
          within(manager).then((extra) => ({ extra })),
      ),
    };
    const payments = {
      recordPriceDifference: vi.fn(() =>
        Promise.resolve({ payment: { id: 'p-diff' }, merchantPayment: { route: 'send_to_runner', amount: '150.00' } }),
      ),
    };
    const service = new PriceChangeService(
      requests as never,
      errands as never,
      errandService as never,
      { emit: vi.fn() } as never,
      payments as never,
    );
    return { service, requests, errands, errandService, payments, manager };
  };

  it('approves in one transaction with the request and errand rows locked', async () => {
    const { service, requests, errands, payments, manager } = setup('IN_PROGRESS');
    await service.approve('e-1', 'pc-1', customerActor);
    expect(requests.manager.transaction).toHaveBeenCalledTimes(1);
    expect(requests.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
    expect(errands.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
    expect(payments.recordPriceDifference).toHaveBeenCalledWith('e-1', 'pc-1', 150, undefined, manager);
  });

  it('answers a second concurrent approve with 409 price_change_already_decided', async () => {
    const { service, payments, errands } = setup('IN_PROGRESS');
    const [first, second] = await Promise.allSettled([
      service.approve('e-1', 'pc-1', customerActor),
      service.approve('e-1', 'pc-1', customerActor),
    ]);
    expect(first.status).toBe('fulfilled');
    expect(second.status).toBe('rejected');
    const err = (second as PromiseRejectedResult).reason as { code?: string; getStatus?: () => number };
    expect(err.code).toBe('price_change_already_decided');
    expect(err.getStatus?.()).toBe(409);
    expect(payments.recordPriceDifference).toHaveBeenCalledTimes(1);
    expect(errands.update).toHaveBeenCalledTimes(1);
  });

  it('refuses a reject that races an approve on the same request', async () => {
    const { service } = setup('QUOTED');
    const outcomes = await Promise.allSettled([
      service.approve('e-1', 'pc-1', customerActor),
      service.reject('e-1', 'pc-1', { userId: 'admin-1', role: UserRole.ADMIN }),
    ]);
    // Whichever takes the lock first wins; the other sees the decision.
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    const lost = outcomes.find((o) => o.status === 'rejected') as PromiseRejectedResult;
    expect((lost.reason as { code?: string }).code).toBe('price_change_already_decided');
  });

  it('approval moves the merchant amount and records the paid difference', async () => {
    const { service, errands, payments } = setup('IN_PROGRESS');
    const res = await service.approve('e-1', 'pc-1', customerActor);
    expect(errands.update).toHaveBeenCalledWith('e-1', { budget: '650.00' });
    expect(payments.recordPriceDifference).toHaveBeenCalledWith('e-1', 'pc-1', 150, undefined, expect.anything());
    expect(res.status).toBe(PriceChangeStatus.APPROVED);
    expect(res.differencePayment?.payment).toEqual({ id: 'p-diff' });
  });

  it('approval before payment only moves the merchant amount', async () => {
    const { service, payments } = setup('QUOTED');
    const res = await service.approve('e-1', 'pc-1', customerActor);
    expect(payments.recordPriceDifference).not.toHaveBeenCalled();
    expect(res.differencePayment).toBeNull();
  });

  it('customer rejection in IN_PROGRESS cancels through the guarded transition', async () => {
    const { service, errandService } = setup('IN_PROGRESS');
    const res = await service.reject('e-1', 'pc-1', customerActor);
    expect(errandService.transitionWith).toHaveBeenCalledWith(
      'e-1',
      'CANCELLED',
      { type: 'customer', id: 'user-1' },
      expect.stringContaining('Price change rejected'),
      { role: UserRole.CUSTOMER, userId: 'user-1' },
      expect.any(Function),
      'price_change_rejection',
    );
    expect(res.status).toBe(PriceChangeStatus.REJECTED);
  });

  it('refuses customer rejection where the task cannot be cancelled', async () => {
    const { service, errandService } = setup('RUNNER_EN_ROUTE');
    const err = await service.reject('e-1', 'pc-1', customerActor).catch((e: unknown) => e);
    expect((err as { code?: string }).code).toBe('price_change_reject_not_cancellable');
    expect(errandService.transitionWith).not.toHaveBeenCalled();
  });
});
