import { describe, expect, it, vi } from 'vitest';
import {
  AssignmentStatus,
  ErrandStatus,
  VerificationLevel,
} from '../common/enums';
import { ErrandAssignment } from './errand-assignment.entity';
import { Errand } from './errand.entity';
import { ErrandsService } from './errands.service';

const errand = (id: string): Errand =>
  ({
    id,
    customerId: 'cust-1',
    status: ErrandStatus.RUNNER_ASSIGNED,
    createdAt: new Date('2026-10-01T10:00:00Z'),
  }) as Errand;

const assignment = (over: Partial<ErrandAssignment>): ErrandAssignment =>
  ({
    id: 'asg-1',
    errandId: 'e-1',
    runnerProfileId: 'runner-1',
    status: AssignmentStatus.ASSIGNED,
    decidedAt: new Date('2026-10-01T11:00:00Z'),
    createdAt: new Date('2026-10-01T10:30:00Z'),
    ...over,
  }) as ErrandAssignment;

const build = (opts: {
  errands?: Errand[];
  assignments?: ErrandAssignment[];
  locations?: object[];
  items?: object[];
  quotes?: object[];
}) => {
  const locationsRepo = { find: vi.fn(() => Promise.resolve(opts.locations ?? [])) };
  const quotesRepo = { find: vi.fn(() => Promise.resolve(opts.quotes ?? [])) };
  const itemsRepo = { find: vi.fn(() => Promise.resolve(opts.items ?? [])) };
  const errandsRepo = {
    findOne: vi.fn(({ where }: { where: { id: string } }) =>
      Promise.resolve(opts.errands?.find((e) => e.id === where.id) ?? null),
    ),
  };
  const assignmentsRepo = {
    find: vi.fn(() => Promise.resolve(opts.assignments ?? [])),
    findOne: vi.fn(() => Promise.resolve(opts.assignments?.[0] ?? null)),
  };
  const runners = {
    publicSummaries: vi.fn((ids: string[]) =>
      Promise.resolve(
        new Map(
          ids.map((id) => [
            id,
            {
              id,
              verificationLevel: VerificationLevel.TWO_ID_VERIFIED,
              avgRating: '4.80',
              errandsCompleted: 12,
            },
          ]),
        ),
      ),
    ),
  };
  const service = new ErrandsService(
    {} as never,
    errandsRepo as never,
    locationsRepo as never,
    itemsRepo as never,
    {} as never,
    assignmentsRepo as never,
    {} as never,
    {} as never,
    { emit: vi.fn() } as never,
    runners as never,
    quotesRepo as never,
  );
  return { service, assignmentsRepo, runners };
};

const admin = { role: 'admin', userId: 'admin-1' };

describe('ErrandsService errand views (A-4)', () => {
  it('embeds the active assignment and public runner summary', async () => {
    const { service } = build({
      errands: [errand('e-1')],
      assignments: [assignment({})],
    });

    const view = await service.getDetail('e-1', admin);

    expect(view.id).toBe('e-1');
    expect(view.assignment).toEqual({
      id: 'asg-1',
      status: AssignmentStatus.ASSIGNED,
      assignedAt: new Date('2026-10-01T11:00:00Z'),
      runner: {
        id: 'runner-1',
        verificationLevel: VerificationLevel.TWO_ID_VERIFIED,
        avgRating: '4.80',
        errandsCompleted: 12,
      },
    });
  });

  it('returns assignment: null when no runner holds the errand', async () => {
    const { service, runners } = build({ errands: [errand('e-1')] });

    const view = await service.getDetail('e-1', admin);

    expect(view.assignment).toBeNull();
    expect(runners.publicSummaries).toHaveBeenCalledWith([]);
  });

  it('falls back to createdAt when the assignment has no decidedAt', async () => {
    const { service } = build({
      errands: [errand('e-1')],
      assignments: [assignment({ decidedAt: null })],
    });

    const view = await service.getDetail('e-1', admin);

    expect(view.assignment?.assignedAt).toEqual(new Date('2026-10-01T10:30:00Z'));
  });

  it('batches assignments for list pages and keeps the newest per errand', async () => {
    const { service, assignmentsRepo, runners } = build({
      assignments: [
        assignment({ id: 'asg-new', errandId: 'e-1', runnerProfileId: 'runner-2' }),
        assignment({ id: 'asg-old', errandId: 'e-1', runnerProfileId: 'runner-1' }),
      ],
    });
    vi.spyOn(service, 'listFor').mockResolvedValue({
      items: [errand('e-1'), errand('e-2')],
      nextCursor: 'abc',
    });

    const page = await service.listViewsFor(admin, { limit: 2 });

    expect(assignmentsRepo.find).toHaveBeenCalledTimes(1);
    expect(runners.publicSummaries).toHaveBeenCalledWith(['runner-2']);
    expect(page.nextCursor).toBe('abc');
    expect(page.items[0].assignment?.id).toBe('asg-new');
    expect(page.items[0].assignment?.runner?.id).toBe('runner-2');
    expect(page.items[1].assignment).toBeNull();
  });

  it('embeds locations as lat/lng and structured items, grouped per errand', async () => {
    const { service } = build({
      errands: [errand('e-1')],
      locations: [
        {
          id: 'l-1',
          errandId: 'e-1',
          pointType: 'pickup',
          coordinates: { type: 'Point', coordinates: [39.7, -4.04] },
          addressText: 'Nyali Centre',
          placeId: 'abc',
        },
        {
          id: 'l-x',
          errandId: 'e-other',
          pointType: 'dropoff',
          coordinates: { type: 'Point', coordinates: [1, 2] },
          addressText: 'Elsewhere',
          placeId: null,
        },
      ],
      items: [
        { id: 'i-1', errandId: 'e-1', name: 'Milk', quantity: 2, unit: 'l', notes: null },
      ],
    });

    const view = await service.getDetail('e-1', admin);

    expect(view.locations).toEqual([
      {
        id: 'l-1',
        pointType: 'pickup',
        lat: -4.04,
        lng: 39.7,
        addressText: 'Nyali Centre',
        placeId: 'abc',
      },
    ]);
    expect(view.items).toEqual([
      { id: 'i-1', name: 'Milk', quantity: 2, unit: 'l', notes: null },
    ]);
  });
});

describe('ErrandsService derived view fields (rows 34, 42-44)', () => {
  it('adds feeTotal from the quote and merchantDetailsAvailable', async () => {
    const quoted = Object.assign(errand('e-1'), {
      quotedPrice: '1000.00',
      merchantTillNumber: '123456',
      merchantPaybillNumber: null,
    });
    const { service } = build({ errands: [quoted] });
    const view = await service.getDetail('e-1', admin);
    expect(view.feeTotal).toBe('500.00');
    expect(view.merchantDetailsAvailable).toBe(true);
  });

  it('has a null feeTotal before the quote', async () => {
    const draft = Object.assign(errand('e-1'), { quotedPrice: null });
    const { service } = build({ errands: [draft] });
    const view = await service.getDetail('e-1', admin);
    expect(view.feeTotal).toBeNull();
    expect(view.merchantDetailsAvailable).toBe(false);
  });
});

describe('ErrandsService quote fields on views (N-5, row 72)', () => {
  const expires = new Date('2026-10-09T10:00:00Z');

  it('exposes the newest quote expiry and whether a re-quote awaits acceptance', async () => {
    const accepted = Object.assign(errand('e-1'), { status: ErrandStatus.ACCEPTED });
    const { service } = build({
      errands: [accepted],
      quotes: [
        { id: 'q-2', errandId: 'e-1', expiresAt: expires, acceptedAt: null },
        { id: 'q-1', errandId: 'e-1', expiresAt: null, acceptedAt: new Date() },
      ],
    });
    const view = await service.getDetail('e-1', admin);
    expect(view.quoteExpiresAt).toEqual(expires);
    expect(view.quoteAcceptanceRequired).toBe(true);
  });

  it('is null/false without a quote', async () => {
    const { service } = build({ errands: [errand('e-1')] });
    const view = await service.getDetail('e-1', admin);
    expect(view.quoteExpiresAt).toBeNull();
    expect(view.quoteAcceptanceRequired).toBe(false);
  });
});
