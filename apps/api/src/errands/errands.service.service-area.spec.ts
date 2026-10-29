import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../common/api-error';
import { ErrandCategory, ErrandPointType, ErrandStatus, StatusHistoryActor } from '../common/enums';
import { CustomerProfile } from '../customers/customer-profile.entity';
import { CreateErrandDto } from './dto/errand.dto';
import { ErrandLocation } from './errand-location.entity';
import { ErrandStatusHistory } from './errand-status-history.entity';
import { Errand } from './errand.entity';
import { ErrandsService, OUTSIDE_SERVICE_AREA_EVENT, firstPointOf } from './errands.service';
import { Quote } from './quote.entity';

/** Row 233 (owner, 2026-10-19): no task inside no configured service area. */
const PICKUP = { lat: -1.2, lng: 36.8 };
const DROPOFF = { lat: -4.04, lng: 39.7 };

const build = (
  status: ErrandStatus,
  inArea: (p: { lat: number; lng: number }) => boolean,
  latestQuote: { id: string; expiresAt: Date | null } | null = { id: 'q-1', expiresAt: new Date(Date.now() - 60_000) },
) => {
  const errand = { id: 'e-1', customerId: 'c-1', status, deadlineAt: new Date(Date.now() + 3_600_000) } as Errand;
  const stored = [
    { pointType: ErrandPointType.DROPOFF, coordinates: { coordinates: [DROPOFF.lng, DROPOFF.lat] } },
    { pointType: ErrandPointType.PICKUP, coordinates: { coordinates: [PICKUP.lng, PICKUP.lat] } },
  ];
  const saved: unknown[] = [];
  const repos = new Map<unknown, unknown>([
    [
      Errand,
      {
        findOne: vi.fn(() => Promise.resolve(errand)),
        create: vi.fn((r: object) => r),
        save: vi.fn((r: object) => {
          saved.push(r);
          return Promise.resolve(Object.assign(r, { id: 'e-1' }));
        }),
        update: vi.fn(() => Promise.resolve()),
      },
    ],
    [ErrandLocation, { find: vi.fn(() => Promise.resolve(stored)), create: vi.fn((r: object) => r), save: vi.fn((r: unknown) => Promise.resolve(r)) }],
    [ErrandStatusHistory, { create: vi.fn((r: object) => r), save: vi.fn((r: object) => Promise.resolve(r)) }],
    [CustomerProfile, { findOne: vi.fn(() => Promise.resolve({ id: 'c-1' })) }],
    [
      Quote,
      {
        create: vi.fn((r: object) => r),
        save: vi.fn((r: object) => Promise.resolve(r)),
        findOne: vi.fn(() => Promise.resolve(latestQuote)),
      },
    ],
  ]);
  const manager = { getRepository: (entity: unknown) => repos.get(entity) };
  const inServiceArea = vi.fn(inArea);
  const emit = vi.fn();
  const service = new ErrandsService(
    { transaction: vi.fn((cb: (m: unknown) => unknown) => cb(manager)) } as never,
    { findOne: vi.fn(() => Promise.resolve(Object.assign({}, errand, { reference: 'NT-42' }))) } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { findOne: vi.fn(() => Promise.resolve({ id: 'c-1', userId: 'u-c-1' })) } as never,
    {} as never,
    { emit } as never,
    { inServiceArea } as never,
    {} as never,
  );
  return { service, errand, saved, inServiceArea, emit };
};

const codeOf = async (p: Promise<unknown>) => {
  const err = await p.catch((e: unknown) => e);
  return err instanceof ApiError ? (err.getResponse() as Record<string, unknown>) : { thrown: String(err) };
};

const dto = {
  category: ErrandCategory.PICKUP_DELIVERY,
  description: 'Collect the parcel',
  budget: 200,
  locations: [
    { pointType: ErrandPointType.DROPOFF, lat: DROPOFF.lat, lon: DROPOFF.lng, addressText: 'Nyali' },
    { pointType: ErrandPointType.PICKUP, lat: PICKUP.lat, lon: PICKUP.lng, addressText: 'CBD' },
  ],
} as CreateErrandDto;

const ADMIN = { type: StatusHistoryActor.ADMIN, id: 'admin-1' };

describe('row 233: tasks inside no service area', () => {
  it('firstPointOf: task site, else pickup, else drop-off', () => {
    expect(firstPointOf([{ pointType: 'dropoff' }, { pointType: 'pickup' }])?.pointType).toBe('pickup');
    expect(firstPointOf([{ pointType: 'dropoff' }, { pointType: 'task_site' }])?.pointType).toBe('task_site');
    expect(firstPointOf([])).toBeNull();
  });

  it('refuses create when the first point is outside every area (422 location_outside_service_area)', async () => {
    const { service, saved, inServiceArea } = build(ErrandStatus.DRAFT, () => false);
    expect(await codeOf(service.createDraft('u-1', dto, { type: StatusHistoryActor.CUSTOMER, id: 'u-1' }))).toMatchObject({
      statusCode: 422,
      code: 'location_outside_service_area',
      pointType: 'pickup',
    });
    expect(inServiceArea).toHaveBeenCalledWith(expect.objectContaining(PICKUP));
    expect(saved).toHaveLength(0);
  });

  it('only the first point counts: a drop-off outside does not matter', async () => {
    const { service, saved } = build(ErrandStatus.DRAFT, (p) => p.lat === PICKUP.lat);
    Object.assign(service, { derivedFields: () => ({}) });
    await service.createDraft('u-1', dto, { type: StatusHistoryActor.CUSTOMER, id: 'u-1' });
    expect(saved).toHaveLength(1);
  });

  it('refuses submit of a stored draft outside every area', async () => {
    const { service, errand } = build(ErrandStatus.DRAFT, () => false);
    expect(
      await codeOf(service.transition('e-1', ErrandStatus.REQUESTED, { type: StatusHistoryActor.CUSTOMER, id: 'c-1' })),
    ).toMatchObject({ code: 'location_outside_service_area', pointType: 'pickup' });
    expect(errand.status).toBe(ErrandStatus.DRAFT);
  });

  it('refuses the first quote and a re-quote', async () => {
    const requested = build(ErrandStatus.REQUESTED, () => false);
    expect(await codeOf(requested.service.quote('e-1', { total: 500 } as never, ADMIN))).toMatchObject({
      code: 'location_outside_service_area',
    });
    expect(requested.errand.status).toBe(ErrandStatus.REQUESTED);
    const quoted = build(ErrandStatus.QUOTED, () => false);
    expect(await codeOf(quoted.service.quote('e-1', { total: 500 } as never, ADMIN))).toMatchObject({
      code: 'location_outside_service_area',
    });
  });

  it('row 249 (b): a re-quote of a still-valid quote is refused as quote_still_valid, never as out-of-area, and sends no notification', async () => {
    for (const status of [ErrandStatus.QUOTED, ErrandStatus.ACCEPTED]) {
      const valid = build(status, () => false, { id: 'q-1', expiresAt: new Date(Date.now() + 3_600_000) });
      expect(await codeOf(valid.service.quote('e-1', { total: 500 } as never, ADMIN))).toMatchObject({
        code: 'quote_still_valid',
      });
      await new Promise((r) => setImmediate(r));
      expect(valid.inServiceArea).not.toHaveBeenCalled();
      expect(valid.emit).not.toHaveBeenCalledWith(OUTSIDE_SERVICE_AREA_EVENT, expect.anything());
    }
  });

  it('row 249 (b): an expired-quote re-quote outside every area is refused and tells the customer', async () => {
    const expired = build(ErrandStatus.ACCEPTED, () => false);
    expect(await codeOf(expired.service.quote('e-1', { total: 500 } as never, ADMIN))).toMatchObject({
      code: 'location_outside_service_area',
    });
    await new Promise((r) => setImmediate(r));
    expect(expired.emit).toHaveBeenCalledWith(OUTSIDE_SERVICE_AREA_EVENT, { errandId: 'e-1', reference: 'NT-42' });
  });

  it('a quote refused as out-of-area tells the customer (row 236); a create or submit refusal does not', async () => {
    const requested = build(ErrandStatus.REQUESTED, () => false);
    await codeOf(requested.service.quote('e-1', { total: 500 } as never, ADMIN));
    await new Promise((r) => setImmediate(r));
    expect(requested.emit).toHaveBeenCalledWith(OUTSIDE_SERVICE_AREA_EVENT, { errandId: 'e-1', reference: 'NT-42' });
    const draft = build(ErrandStatus.DRAFT, () => false);
    await codeOf(draft.service.transition('e-1', ErrandStatus.REQUESTED, { type: StatusHistoryActor.CUSTOMER, id: 'c-1' }));
    await new Promise((r) => setImmediate(r));
    expect(draft.emit).not.toHaveBeenCalledWith(OUTSIDE_SERVICE_AREA_EVENT, expect.anything());
  });
});

/** Row 236 (C-14-2): `outsideServiceArea` on the customer errand view. */
describe('row 236: outsideServiceArea on the errand view', () => {
  const EXPIRED = [{ id: 'q-1', errandId: 'e-1', expiresAt: new Date(Date.now() - 60_000), acceptedAt: null, createdAt: new Date() }];
  const VALID = [{ id: 'q-1', errandId: 'e-1', expiresAt: new Date(Date.now() + 3_600_000), acceptedAt: null, createdAt: new Date() }];
  const viewFor = (
    status: ErrandStatus,
    inArea: (p: { lat: number; lng: number }) => boolean,
    quotes: unknown[] = EXPIRED,
  ) => {
    const errand = { id: 'e-1', customerId: 'c-1', status, quotedPrice: null } as unknown as Errand;
    const stored = [
      { errandId: 'e-1', pointType: ErrandPointType.DROPOFF, coordinates: { coordinates: [DROPOFF.lng, DROPOFF.lat] } },
      { errandId: 'e-1', pointType: ErrandPointType.PICKUP, coordinates: { coordinates: [PICKUP.lng, PICKUP.lat] } },
    ];
    const inServiceArea = vi.fn(inArea);
    const none = { find: vi.fn(() => Promise.resolve([])) };
    const service = new ErrandsService(
      {} as never,
      { findOne: vi.fn(() => Promise.resolve(errand)), find: vi.fn(() => Promise.resolve([errand])) } as never,
      { find: vi.fn(() => Promise.resolve(stored)) } as never,
      none as never,
      none as never,
      none as never,
      { findOne: vi.fn(() => Promise.resolve({ id: 'c-1', userId: 'u-c-1' })) } as never,
      {} as never,
      { emit: vi.fn() } as never,
      { inServiceArea, publicSummaries: vi.fn(() => Promise.resolve(new Map())) } as never,
      { find: vi.fn(() => Promise.resolve(quotes)) } as never,
    );
    Object.assign(service, { canView: () => Promise.resolve(true) });
    return { service, inServiceArea };
  };
  const CUSTOMER = { role: 'customer', userId: 'u-1' } as never;
  const ADMIN_VIEWER = { role: 'admin', userId: 'a-1' } as never;

  it.each([ErrandStatus.REQUESTED, ErrandStatus.QUOTED, ErrandStatus.ACCEPTED])(
    'is true for a %s task (QUOTED/ACCEPTED: quote expired) whose first point is outside every area',
    async (status) => {
      const { service, inServiceArea } = viewFor(status, () => false);
      const view = await service.getDetail('e-1', CUSTOMER);
      expect(view.outsideServiceArea).toBe(true);
      // Same point as the quote refusal: the pickup, not the drop-off.
      expect(inServiceArea).toHaveBeenCalledWith(expect.objectContaining(PICKUP));
    },
  );

  it('is true for REQUESTED whatever the quotes (row 249 b)', async () => {
    const { service } = viewFor(ErrandStatus.REQUESTED, () => false, []);
    expect((await service.getDetail('e-1', CUSTOMER)).outsideServiceArea).toBe(true);
  });

  it.each([ErrandStatus.QUOTED, ErrandStatus.ACCEPTED])(
    'row 249 (b): is false for %s while the quote is still valid (the customer can still pay), without the area check',
    async (status) => {
      const { service, inServiceArea } = viewFor(status, () => false, VALID);
      expect((await service.getDetail('e-1', CUSTOMER)).outsideServiceArea).toBe(false);
      expect(inServiceArea).not.toHaveBeenCalled();
    },
  );

  it('row 249 (b): the list view applies the same rule per task', async () => {
    const { service } = viewFor(ErrandStatus.QUOTED, () => false, VALID);
    const [view] = await (service as unknown as { withAssignments: (e: unknown[], v: unknown) => Promise<{ outsideServiceArea?: boolean }[]> })
      .withAssignments([{ id: 'e-1', customerId: 'c-1', status: ErrandStatus.QUOTED, quotedPrice: null }], CUSTOMER);
    expect(view.outsideServiceArea).toBe(false);
  });

  it('is false when the first point is inside an area (a drop-off outside does not count)', async () => {
    const { service } = viewFor(ErrandStatus.REQUESTED, (p) => p.lat === PICKUP.lat);
    expect((await service.getDetail('e-1', CUSTOMER)).outsideServiceArea).toBe(false);
  });

  it.each([ErrandStatus.DRAFT, ErrandStatus.PAYMENT_CONFIRMED, ErrandStatus.CANCELLED])(
    'is false in %s (no quote is attempted there), without running the area check',
    async (status) => {
      const { service, inServiceArea } = viewFor(status, () => false);
      expect((await service.getDetail('e-1', CUSTOMER)).outsideServiceArea).toBe(false);
      expect(inServiceArea).not.toHaveBeenCalled();
    },
  );

  it('is not part of the admin view (the admin spec does not use it)', async () => {
    const { service } = viewFor(ErrandStatus.REQUESTED, () => false);
    Object.assign(service, {
      assignments: { find: vi.fn(() => Promise.resolve([])) },
      noRunnerExpiryBlocker: () => Promise.resolve({ reason: 'not_runner_assigned' }),
    });
    const view = await service.getDetail('e-1', ADMIN_VIEWER);
    expect(view).not.toHaveProperty('outsideServiceArea');
  });
});
