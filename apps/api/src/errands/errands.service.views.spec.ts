import { describe, expect, it, vi } from 'vitest';
import {
  AssignmentDeclineReason,
  AssignmentStatus,
  ErrandStatus,
  VerificationLevel,
} from '../common/enums';
import { ErrandAssignment } from './errand-assignment.entity';
import { Errand } from './errand.entity';
import { ForbiddenException } from '@nestjs/common';
import { ErrandsService, withoutCustomerPricing } from './errands.service';

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
    offerExpiresAt: new Date('2026-10-01T11:10:00Z'),
    createdAt: new Date('2026-10-01T10:30:00Z'),
    ...over,
  }) as ErrandAssignment;

const build = (opts: {
  errands?: Errand[];
  assignments?: ErrandAssignment[];
  locations?: object[];
  items?: object[];
  quotes?: object[];
  latest?: ErrandAssignment[];
  acceptedInHistory?: string[];
}) => {
  const locationsRepo = {
    find: vi.fn(() => Promise.resolve(opts.locations ?? [])),
  };
  const quotesRepo = { find: vi.fn(() => Promise.resolve(opts.quotes ?? [])) };
  const itemsRepo = { find: vi.fn(() => Promise.resolve(opts.items ?? [])) };
  const errandsRepo = {
    findOne: vi.fn(({ where }: { where: { id: string } }) =>
      Promise.resolve(opts.errands?.find((e) => e.id === where.id) ?? null),
    ),
  };
  const latestQb: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of ['distinctOn', 'where', 'orderBy', 'addOrderBy']) {
    latestQb[m] = vi.fn(() => latestQb);
  }
  latestQb.getMany = vi.fn(() => Promise.resolve(opts.latest ?? []));
  const assignmentsRepo = {
    find: vi.fn(() => Promise.resolve(opts.assignments ?? [])),
    findOne: vi.fn(() => Promise.resolve(opts.assignments?.[0] ?? null)),
    createQueryBuilder: vi.fn(() => latestQb),
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
  const historyRepo = {
    find: vi.fn(() =>
      Promise.resolve(
        (opts.acceptedInHistory ?? []).map((errandId) => ({ errandId })),
      ),
    ),
  };
  const service = new ErrandsService(
    {} as never,
    errandsRepo as never,
    locationsRepo as never,
    itemsRepo as never,
    historyRepo as never,
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
      offerExpiresAt: new Date('2026-10-01T11:10:00Z'),
      offeredAt: new Date('2026-10-01T10:30:00Z'),
      decidedAt: null,
      declineReason: null,
      runner: {
        id: 'runner-1',
        verificationLevel: VerificationLevel.TWO_ID_VERIFIED,
        avgRating: '4.80',
        errandsCompleted: 12,
      },
    });
  });

  it('admin detail lists every assignment newest first with decision fields, and the offer window (row 157)', async () => {
    const declined = assignment({
      id: 'asg-0',
      runnerProfileId: 'runner-0',
      status: AssignmentStatus.DECLINED,
      decidedAt: new Date('2026-10-01T10:20:00Z'),
      declineReason: AssignmentDeclineReason.OVER_PURCHASE_LIMIT,
      createdAt: new Date('2026-10-01T10:15:00Z'),
    });
    const { service, assignmentsRepo } = build({
      errands: [errand('e-1')],
      assignments: [declined],
    });
    const view = await service.getDetail('e-1', admin);
    expect(assignmentsRepo.find).toHaveBeenLastCalledWith({
      where: { errandId: 'e-1' },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
    expect(view.assignments).toEqual([
      expect.objectContaining({
        id: 'asg-0',
        status: AssignmentStatus.DECLINED,
        offeredAt: new Date('2026-10-01T10:15:00Z'),
        decidedAt: new Date('2026-10-01T10:20:00Z'),
        declineReason: AssignmentDeclineReason.OVER_PURCHASE_LIMIT,
        runner: expect.objectContaining({ id: 'runner-0' }),
      }),
    ]);
    expect(view.offerWindowSeconds).toBe(600);
    expect(view.lastAssignment).toMatchObject({
      id: 'asg-0',
      status: AssignmentStatus.DECLINED,
    });
  });

  it('a customer sees no runner until the offer is accepted (row 183)', async () => {
    const customerViewer = { role: 'customer', userId: 'u-1' };
    const open = build({
      errands: [errand('e-1')],
      assignments: [assignment({})],
    });
    Object.assign(open.service, {
      getById: vi.fn(() => Promise.resolve(errand('e-1'))),
    });
    expect(
      (await open.service.getDetail('e-1', customerViewer)).assignment,
    ).toBeNull();
    // Admin and runner views still carry the open offer.
    expect(
      (await open.service.getDetail('e-1', admin)).assignment?.status,
    ).toBe(AssignmentStatus.ASSIGNED);
    Object.assign(open.service, {
      getById: vi.fn(() => Promise.resolve(errand('e-1'))),
    });
    expect(
      (await open.service.getDetail('e-1', { role: 'runner', userId: 'u-r' }))
        .assignment?.status,
    ).toBe(AssignmentStatus.ASSIGNED);
    // Reviewer B1: an ended task (cancelled before the accept) still shows no runner.
    const cancelled = build({
      errands: [errand('e-1')],
      assignments: [assignment({})],
    });
    Object.assign(cancelled.service, {
      getById: vi.fn(() =>
        Promise.resolve(
          Object.assign(errand('e-1'), { status: ErrandStatus.CANCELLED }),
        ),
      ),
    });
    expect(
      (await cancelled.service.getDetail('e-1', customerViewer)).assignment,
    ).toBeNull();
    // A pre-round-7 accept (row still `assigned`) shows once the history proves it.
    const legacy = build({
      errands: [errand('e-1')],
      assignments: [assignment({})],
      acceptedInHistory: ['e-1'],
    });
    Object.assign(legacy.service, {
      getById: vi.fn(() =>
        Promise.resolve(
          Object.assign(errand('e-1'), { status: ErrandStatus.ARRIVED }),
        ),
      ),
    });
    expect(
      (await legacy.service.getDetail('e-1', customerViewer)).assignment?.runner
        ?.id,
    ).toBe('runner-1');
    const accepted = build({
      errands: [errand('e-1')],
      assignments: [assignment({ status: AssignmentStatus.ACCEPTED })],
    });
    Object.assign(accepted.service, {
      getById: vi.fn(() =>
        Promise.resolve(
          Object.assign(errand('e-1'), {
            status: ErrandStatus.RUNNER_EN_ROUTE,
          }),
        ),
      ),
    });
    expect(
      (await accepted.service.getDetail('e-1', customerViewer)).assignment,
    ).toMatchObject({
      status: AssignmentStatus.ACCEPTED,
      runner: expect.objectContaining({ id: 'runner-1' }),
    });
  });

  it('non-admin detail carries no assignment history', async () => {
    const { service } = build({
      errands: [errand('e-1')],
      assignments: [assignment({})],
    });
    Object.assign(service, {
      getById: vi.fn(() => Promise.resolve(errand('e-1'))),
    });
    const view = await service.getDetail('e-1', {
      role: 'customer',
      userId: 'u-1',
    });
    expect(view.assignments).toBeUndefined();
    expect(view.lastAssignment).toBeUndefined();
    expect(view.offerWindowSeconds).toBeUndefined();
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

    expect(view.assignment?.assignedAt).toEqual(
      new Date('2026-10-01T10:30:00Z'),
    );
  });

  it('batches assignments for list pages and keeps the newest per errand', async () => {
    const { service, assignmentsRepo, runners } = build({
      assignments: [
        assignment({
          id: 'asg-new',
          errandId: 'e-1',
          runnerProfileId: 'runner-2',
        }),
        assignment({
          id: 'asg-old',
          errandId: 'e-1',
          runnerProfileId: 'runner-1',
        }),
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

  it('admin list items carry lastAssignment whatever its status; assignment unchanged (row 157)', async () => {
    const { service } = build({
      latest: [
        assignment({
          id: 'asg-x',
          errandId: 'e-2',
          runnerProfileId: 'runner-3',
          status: AssignmentStatus.EXPIRED,
        }),
      ],
    });
    vi.spyOn(service, 'listFor').mockResolvedValue({
      items: [errand('e-1'), errand('e-2')],
      nextCursor: null,
    });
    const page = await service.listViewsFor(admin, { limit: 2 });
    expect(page.items[0].lastAssignment).toBeNull();
    expect(page.items[1].assignment).toBeNull();
    expect(page.items[1].lastAssignment).toMatchObject({
      id: 'asg-x',
      status: AssignmentStatus.EXPIRED,
      decidedAt: new Date('2026-10-01T11:00:00Z'),
      runner: expect.objectContaining({ id: 'runner-3' }),
    });
    vi.spyOn(service, 'listFor').mockResolvedValue({
      items: [errand('e-1'), errand('e-2')],
      nextCursor: null,
    });
    const customerPage = await service.listViewsFor(
      { role: 'customer', userId: 'u-1' },
      { limit: 2 },
    );
    expect(customerPage.items[1]).not.toHaveProperty('lastAssignment');
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
        {
          id: 'i-1',
          errandId: 'e-1',
          name: 'Milk',
          quantity: 2,
          unit: 'l',
          notes: null,
        },
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
    const accepted = Object.assign(errand('e-1'), {
      status: ErrandStatus.ACCEPTED,
    });
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

describe('runner views carry no customer pricing (RA-2)', () => {
  it('withoutCustomerPricing clears the quoted and final price, fee total and quote fields', () => {
    const view = withoutCustomerPricing({
      quotedPrice: '1000.00',
      finalPrice: '1000.00',
      feeTotal: '500.00',
      quoteExpiresAt: new Date(),
      quoteAcceptanceRequired: true,
      budget: '5000.00',
    } as never) as Record<string, unknown>;
    expect(view).toMatchObject({
      quotedPrice: null,
      finalPrice: null,
      feeTotal: null,
      quoteExpiresAt: null,
      quoteAcceptanceRequired: false,
      budget: '5000.00',
    });
  });

  it('refuses the quote breakdown to a runner', async () => {
    const service = new ErrandsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { emit: () => undefined } as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.latestQuoteFor('e-1', { role: 'runner', userId: 'u-1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('history actors are admin-only (reviewer B2)', () => {
  const build = () => {
    const rows = [
      { id: 'h-1', actorType: 'customer', actorId: 'u-cust', toStatus: 'REQUESTED' },
      { id: 'h-2', actorType: 'system', actorId: null, toStatus: 'EXPIRED' },
    ];
    const users = { displayNames: vi.fn(() => Promise.resolve(new Map([['u-cust', 'Achieng Otieno']]))) };
    const service = new ErrandsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { find: vi.fn(() => Promise.resolve(rows.map((r) => ({ ...r })))) } as never,
      {} as never,
      {} as never,
      {} as never,
      { emit: () => undefined } as never,
      {} as never,
      {} as never,
      undefined,
      users as never,
    );
    return { service, users };
  };

  it('adds actor { id, displayName } for an admin viewer', async () => {
    const { service } = build();
    const out = (await service.historyViewsFor('e-1', { role: 'admin', userId: 'a-1' })) as { actor: unknown }[];
    expect(out.map((r) => r.actor)).toEqual([{ id: 'u-cust', displayName: 'Achieng Otieno' }, null]);
  });

  it('returns plain rows without names to customers and runners', async () => {
    for (const role of ['customer', 'runner']) {
      const { service, users } = build();
      const out = (await service.historyViewsFor('e-1', { role, userId: 'u-1' })) as object[];
      expect(out.every((r) => !('actor' in r))).toBe(true);
      expect(users.displayNames).not.toHaveBeenCalled();
    }
  });
});
