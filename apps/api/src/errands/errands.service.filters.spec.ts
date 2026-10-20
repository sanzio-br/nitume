import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';
import { ErrandStatus } from '../common/enums';
import { ErrandStatusFilterDto, ListErrandsQueryDto } from './dto/errand.dto';
import { ErrandsService } from './errands.service';

const fakeQb = () => {
  const qb = {
    where: vi.fn(() => qb),
    andWhere: vi.fn(() => qb),
    innerJoin: vi.fn(() => qb),
    orderBy: vi.fn(() => qb),
    addOrderBy: vi.fn(() => qb),
    limit: vi.fn(() => qb),
    getMany: vi.fn(() => Promise.resolve([])),
    getCount: vi.fn(() => Promise.resolve(7)),
  };
  return qb;
};

const build = () => {
  const qb = fakeQb();
  const service = new ErrandsService(
    {} as never,
    { createQueryBuilder: vi.fn(() => qb) } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { findOne: vi.fn(() => Promise.resolve({ id: 'cust-1' })) } as never,
    { findOne: vi.fn(() => Promise.resolve({ id: 'runner-1' })) } as never,
    { emit: vi.fn() } as never,
    {} as never,
    {} as never,
  );
  return { service, qb };
};

const customer = { role: 'customer', userId: 'user-1' };

describe('ListErrandsQueryDto status filter (A-10)', () => {
  it.each([
    ['IN_PROGRESS', ['IN_PROGRESS']],
    ['IN_PROGRESS,ARRIVED', ['IN_PROGRESS', 'ARRIVED']],
    [['IN_PROGRESS', 'ARRIVED,IN_PROGRESS'], ['IN_PROGRESS', 'ARRIVED']],
  ])('normalises %j', async (input, expected) => {
    const dto = plainToInstance(ListErrandsQueryDto, { status: input });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.status).toEqual(expected);
  });

  it('rejects unknown statuses', async () => {
    const dto = plainToInstance(ErrandStatusFilterDto, { status: 'IN_PROGRESS,NOPE' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('status');
  });

  it('treats a missing or empty status as no filter', async () => {
    const dto = plainToInstance(ListErrandsQueryDto, { status: '' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.status).toBeUndefined();
  });
});

describe('ErrandsService status scoping', () => {
  it('uses equality for a single status', async () => {
    const { service, qb } = build();
    await service.listFor(customer, { status: [ErrandStatus.IN_PROGRESS] });
    expect(qb.andWhere).toHaveBeenCalledWith('e.status = :status', {
      status: ErrandStatus.IN_PROGRESS,
    });
  });

  it('uses IN for several statuses', async () => {
    const { service, qb } = build();
    await service.listFor(customer, {
      status: [ErrandStatus.IN_PROGRESS, ErrandStatus.ARRIVED],
    });
    expect(qb.andWhere).toHaveBeenCalledWith('e.status IN (:...statuses)', {
      statuses: [ErrandStatus.IN_PROGRESS, ErrandStatus.ARRIVED],
    });
  });

  it('still accepts a single non-array status (internal callers)', async () => {
    const { service, qb } = build();
    await service.listFor(customer, { status: ErrandStatus.QUOTED });
    expect(qb.andWhere).toHaveBeenCalledWith('e.status = :status', {
      status: ErrandStatus.QUOTED,
    });
  });
});

describe('ErrandsService.countFor (A-11)', () => {
  it('counts the customer\'s own non-draft errands', async () => {
    const { service, qb } = build();
    await expect(service.countFor(customer)).resolves.toEqual({ count: 7 });
    expect(qb.where).toHaveBeenCalledWith('e."customerId" = :profileId', {
      profileId: 'cust-1',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('e.status != :draft', {
      draft: ErrandStatus.DRAFT,
    });
  });

  it('applies the status filter to the count', async () => {
    const { service, qb } = build();
    await service.countFor(customer, [ErrandStatus.SETTLED, ErrandStatus.CANCELLED]);
    expect(qb.andWhere).toHaveBeenCalledWith('e.status IN (:...statuses)', {
      statuses: [ErrandStatus.SETTLED, ErrandStatus.CANCELLED],
    });
  });
});

describe('row 250: tasks cancelled straight from DRAFT', () => {
  const draftCancelFilter = (qb: ReturnType<typeof fakeQb>) =>
    (qb.andWhere.mock.calls as unknown as [string, Record<string, unknown>?][]).find(([sql]) =>
      sql.includes('"errand_status_history"'),
    );

  it.each([
    ['listFor', (s: ErrandsService) => s.listFor(customer, {})],
    ['countFor', (s: ErrandsService) => s.countFor(customer)],
  ])('%s hides a CANCELLED task whose history has DRAFT -> CANCELLED for a customer', async (_name, call) => {
    const { service, qb } = build();
    await call(service);
    const filter = draftCancelFilter(qb);
    expect(filter).toBeDefined();
    expect(filter?.[0]).toMatch(/NOT \(e\.status = :cancelled AND EXISTS/);
    expect(filter?.[0]).toMatch(/h\."fromStatus" = :draft AND h\."toStatus" = :cancelled/);
    expect(filter?.[1]).toEqual({ cancelled: ErrandStatus.CANCELLED, draft: ErrandStatus.DRAFT });
  });

  it.each([
    ['admin', { role: 'admin', userId: 'admin-1' }],
    ['runner', { role: 'runner', userId: 'runner-user-1' }],
  ])('does not filter the %s list', async (_name, viewer) => {
    const { service, qb } = build();
    await service.listFor(viewer, {});
    expect(draftCancelFilter(qb)).toBeUndefined();
  });
});
