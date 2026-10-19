import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../common/api-error';
import { ErrandCategory, ErrandPointType, ErrandUrgency, StatusHistoryActor } from '../common/enums';
import { CustomerProfile } from '../customers/customer-profile.entity';
import { CreateErrandDto } from './dto/errand.dto';
import { ErrandItem } from './errand-item.entity';
import { ErrandLocation } from './errand-location.entity';
import { ErrandStatusHistory } from './errand-status-history.entity';
import { Errand } from './errand.entity';
import { ErrandsService } from './errands.service';

/** Rows 206, 221: every task gets a deadline; the default is creation + 24 h. */
const build = (config: Record<string, number> = {}) => {
  const saved: Partial<Errand>[] = [];
  const passthrough = { create: vi.fn((r: object) => r), save: vi.fn((r: unknown) => Promise.resolve(r)) };
  const repos = new Map<unknown, unknown>([
    [CustomerProfile, { findOne: vi.fn(() => Promise.resolve({ id: 'c-1' })) }],
    [
      Errand,
      {
        create: vi.fn((r: object) => r),
        save: vi.fn((r: Partial<Errand>) => {
          saved.push(r);
          return Promise.resolve(Object.assign(r, { id: 'e-1' }));
        }),
      },
    ],
    [ErrandLocation, passthrough],
    [ErrandItem, passthrough],
    [ErrandStatusHistory, passthrough],
  ]);
  const manager = { getRepository: (entity: unknown) => repos.get(entity) };
  const service = new ErrandsService(
    { transaction: vi.fn((cb: (m: unknown) => unknown) => cb(manager)) } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { emit: vi.fn() } as never,
    {} as never,
    {} as never,
    { get: vi.fn((key: string, def: unknown) => config[key] ?? def) } as never,
  );
  Object.assign(service, { derivedFields: () => ({}) });
  return { service, saved };
};

const dto = (extra: Partial<CreateErrandDto> = {}): CreateErrandDto =>
  ({
    category: ErrandCategory.INSPECTION,
    description: 'Check the flat',
    locations: [{ pointType: ErrandPointType.TASK_SITE, lat: -4.04, lon: 39.7, addressText: 'Nyali' }],
    ...extra,
  }) as CreateErrandDto;

const CUSTOMER = { type: StatusHistoryActor.CUSTOMER, id: 'u-1' };

describe('createDraft deadline (rows 206, 221)', () => {
  it('without a deadline from the customer, sets creation + 24 h (standard urgency)', async () => {
    const { service, saved } = build();
    const before = Date.now();
    await service.createDraft('u-1', dto(), CUSTOMER);
    const ms = (saved[0].deadlineAt as Date).getTime() - before;
    expect(ms).toBeGreaterThanOrEqual(24 * 3_600_000 - 50);
    expect(ms).toBeLessThan(24 * 3_600_000 + 1_000);
    expect(saved[0].urgency).toBe(ErrandUrgency.STANDARD);
  });

  it('uses errands.defaultDeadlineHours when configured', async () => {
    const { service, saved } = build({ 'errands.defaultDeadlineHours': 6 });
    const before = Date.now();
    await service.createDraft('u-1', dto(), CUSTOMER);
    const ms = (saved[0].deadlineAt as Date).getTime() - before;
    expect(ms).toBeGreaterThanOrEqual(6 * 3_600_000 - 50);
    expect(ms).toBeLessThan(6 * 3_600_000 + 1_000);
    expect(service.defaultDeadlineHours()).toBe(6);
  });

  it('keeps the customer deadline, and still refuses one in the past', async () => {
    const { service, saved } = build();
    const at = new Date(Date.now() + 2 * 3_600_000);
    await service.createDraft('u-1', dto({ deadlineAt: at.toISOString() }), CUSTOMER);
    expect(saved[0].deadlineAt).toEqual(at);
    expect(saved[0].urgency).toBe(ErrandUrgency.URGENT);
    const err = await service
      .createDraft('u-1', dto({ deadlineAt: new Date(Date.now() - 60_000).toISOString() }), CUSTOMER)
      .catch((e: unknown) => e);
    expect((err as ApiError).code).toBe('deadline_in_past');
  });
});

describe('deadline at payment confirmation (row 235)', () => {
  const buildPaid = (deadlineAt: Date | null, config: Record<string, number> = {}) => {
    const errand = { id: 'e-1', customerId: 'c-1', status: 'ACCEPTED', deadlineAt } as unknown as Errand;
    const repos = new Map<unknown, unknown>([
      [Errand, { findOne: vi.fn(() => Promise.resolve(errand)), save: vi.fn((e: Errand) => Promise.resolve(e)) }],
      [ErrandStatusHistory, { create: vi.fn((r: object) => r), save: vi.fn((r: object) => Promise.resolve(r)) }],
    ]);
    const manager = { getRepository: (entity: unknown) => repos.get(entity) };
    const service = new ErrandsService(
      { transaction: vi.fn((cb: (m: unknown) => unknown) => cb(manager)) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { emit: vi.fn() } as never,
      {} as never,
      {} as never,
      { get: vi.fn((key: string, def: unknown) => config[key] ?? def) } as never,
    );
    return { service, errand };
  };
  const SYSTEM = { type: StatusHistoryActor.SYSTEM };

  it('a task without a deadline gets payment time + the default when payment is confirmed', async () => {
    const { service, errand } = buildPaid(null, { 'errands.defaultDeadlineHours': 24 });
    const before = Date.now();
    await service.transition('e-1', 'PAYMENT_CONFIRMED' as never, SYSTEM, 'Payment confirmed via STK callback');
    const ms = (errand.deadlineAt as Date).getTime() - before;
    expect(ms).toBeGreaterThanOrEqual(24 * 3_600_000 - 50);
    expect(ms).toBeLessThan(24 * 3_600_000 + 1_000);
  });

  it('a task with a deadline keeps it', async () => {
    const at = new Date(Date.now() + 2 * 3_600_000);
    const { service, errand } = buildPaid(at);
    await service.transition('e-1', 'PAYMENT_CONFIRMED' as never, SYSTEM);
    expect(errand.deadlineAt).toBe(at);
  });
});
