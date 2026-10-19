import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../common/api-error';
import { AssignmentStatus, ErrandCategory, ErrandStatus, RunnerAvailability } from '../common/enums';
import { CandidatesService, matchingExhausted } from './candidates.service';

const TASK = { lat: -1.2864, lng: 36.8172 };

const runner = (
  id: string,
  availability: RunnerAvailability,
  extra: { limit?: number; rating?: string; at?: { lat: number; lng: number } | null } = {},
) => ({
  profile: {
    id,
    availability,
    avgRating: extra.rating ?? '4.50',
    errandsCompleted: 3,
    maxPurchaseAdvance: String(extra.limit ?? 3000),
    currentLocation: extra.at === null ? null : { type: 'Point', coordinates: [(extra.at ?? TASK).lng, (extra.at ?? TASK).lat] },
  },
  displayName: `Runner ${id}`,
});

const build = (opts: {
  status?: ErrandStatus;
  pool: ReturnType<typeof runner>[];
  assignments?: { runnerProfileId: string; status: AssignmentStatus }[];
  required?: number;
}) => {
  const errands = {
    findByIds: vi.fn(() =>
      Promise.resolve([{ id: 'e-1', status: opts.status ?? ErrandStatus.RUNNER_ASSIGNED, category: ErrandCategory.BUY_FOR_ME }]),
    ),
    locationsFor: vi.fn(() =>
      Promise.resolve([
        { pointType: 'dropoff', coordinates: { coordinates: [0, 0] } },
        { pointType: 'pickup', coordinates: { coordinates: [TASK.lng, TASK.lat] } },
      ]),
    ),
    assignmentsOf: vi.fn(() => Promise.resolve(opts.assignments ?? [])),
    onEligibleRemaining: vi.fn(),
  };
  const runners = { poolFor: vi.fn(() => Promise.resolve(opts.pool)) };
  const ledger = { itemPaidToNitume: vi.fn(() => Promise.resolve(opts.required ?? 500)) };
  const service = new CandidatesService(errands as never, runners as never, ledger as never);
  return { service, errands, runners, ledger };
};

describe('CandidatesService (N-20; rows 177, 178, 186, 187 c, 204, 215)', () => {
  it('flags offline runners, counts only eligible online runners, leaves busy runners and the current holder out', async () => {
    const { service, runners } = build({
      pool: [
        runner('on', RunnerAvailability.ONLINE),
        runner('off', RunnerAvailability.OFFLINE),
        runner('busy', RunnerAvailability.BUSY),
        runner('holder', RunnerAvailability.ONLINE),
        runner('declined', RunnerAvailability.ONLINE),
        runner('lapsed', RunnerAvailability.OFFLINE),
        runner('poor', RunnerAvailability.ONLINE, { limit: 100 }),
      ],
      assignments: [
        { runnerProfileId: 'holder', status: AssignmentStatus.ASSIGNED },
        { runnerProfileId: 'declined', status: AssignmentStatus.DECLINED },
        { runnerProfileId: 'lapsed', status: AssignmentStatus.EXPIRED },
        { runnerProfileId: 'gone', status: AssignmentStatus.DECLINED },
      ],
    });
    const page = await service.list('e-1');
    // The pool is asked with the task's first point (pickup before drop-off) and its category.
    expect(runners.poolFor).toHaveBeenCalledWith('buy_for_me', TASK, undefined);
    expect(page).toMatchObject({ eligibleRemaining: 1, offlineCount: 1, triedCount: 3, requiredPurchase: '500.00', nextCursor: null });
    const byId = Object.fromEntries(page.items.map((c) => [c.runnerProfileId, c]));
    expect(Object.keys(byId).sort()).toEqual(['declined', 'lapsed', 'off', 'on', 'poor']);
    expect(byId.off).toMatchObject({ offline: true, availability: 'offline', tried: null, ineligibleReason: null });
    expect(byId.declined).toMatchObject({ offline: false, tried: 'declined' });
    expect(byId.lapsed).toMatchObject({ offline: true, tried: 'expired' });
    expect(byId.poor).toMatchObject({ ineligibleReason: 'over_purchase_limit', purchaseLimit: '100.00' });
    expect(byId.on).toMatchObject({ distanceKm: 0, rating: '4.50', tasksCompleted: 3, displayName: 'Runner on' });
    // Online, untried, within the limit first.
    expect(page.items[0].runnerProfileId).toBe('on');
    expect(page.items.at(-1)?.runnerProfileId).toBe('lapsed');
  });

  it('eligibleRemaining is 0 when only offline or busy runners are left (row 204)', async () => {
    const { service } = build({
      pool: [runner('off', RunnerAvailability.OFFLINE), runner('busy', RunnerAvailability.BUSY)],
    });
    expect(await service.compute('e-1')).toMatchObject({ eligibleRemaining: 0, offlineCount: 1 });
  });

  it('sorts by distance then rating and pages with an opaque cursor', async () => {
    const { service } = build({
      pool: [
        runner('far', RunnerAvailability.ONLINE, { at: { lat: -1.3, lng: 36.85 } }),
        runner('near-low', RunnerAvailability.ONLINE, { rating: '3.00' }),
        runner('near-high', RunnerAvailability.ONLINE, { rating: '4.90' }),
        runner('nowhere', RunnerAvailability.ONLINE, { at: null }),
      ],
    });
    const first = await service.list('e-1', { limit: 2 });
    expect(first.items.map((c) => c.runnerProfileId)).toEqual(['near-high', 'near-low']);
    expect(first.eligibleRemaining).toBe(4);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await service.list('e-1', { limit: 2, cursor: first.nextCursor });
    expect(second.items.map((c) => c.runnerProfileId)).toEqual(['far', 'nowhere']);
    expect(second.items[1].distanceKm).toBeNull();
    expect(second.nextCursor).toBeNull();
    const bad = await service.list('e-1', { cursor: 'not-a-cursor' }).catch((e: unknown) => e);
    expect((bad as ApiError).code).toBe('cursor_invalid');
  });

  it('answers only for PAYMENT_CONFIRMED and RUNNER_ASSIGNED (409 task_not_assignable)', async () => {
    await expect(build({ status: ErrandStatus.PAYMENT_CONFIRMED, pool: [] }).service.list('e-1')).resolves.toMatchObject({
      items: [],
      eligibleRemaining: 0,
    });
    const err = await build({ status: ErrandStatus.RUNNER_EN_ROUTE, pool: [] })
      .service.list('e-1')
      .catch((e: unknown) => e);
    expect((err as ApiError).getResponse()).toMatchObject({ statusCode: 409, code: 'task_not_assignable', status: 'RUNNER_EN_ROUTE' });
  });

  it('registers the eligible count with the errands module and reads inside the given transaction', async () => {
    const { service, errands, runners, ledger } = build({ pool: [runner('on', RunnerAvailability.ONLINE)] });
    service.onModuleInit();
    const [[counter]] = errands.onEligibleRemaining.mock.calls as unknown as [[(m: unknown, id: string) => Promise<number>]];
    const manager = {};
    expect(await counter(manager, 'e-1')).toBe(1);
    expect(runners.poolFor).toHaveBeenCalledWith('buy_for_me', TASK, manager);
    expect(errands.assignmentsOf).toHaveBeenCalledWith('e-1', manager);
    expect(ledger.itemPaidToNitume).toHaveBeenCalledWith('e-1', manager);
  });
});

describe('matchingExhausted (rows 204, 227)', () => {
  it('needs at least one offer made, no open offer and no eligible online runner left', () => {
    expect(matchingExhausted({ offersMade: 0, openOffer: false, eligibleRemaining: 0 })).toBe(false);
    expect(matchingExhausted({ offersMade: 2, openOffer: false, eligibleRemaining: 0 })).toBe(true);
    expect(matchingExhausted({ offersMade: 2, openOffer: true, eligibleRemaining: 0 })).toBe(false);
    expect(matchingExhausted({ offersMade: 2, openOffer: false, eligibleRemaining: 1 })).toBe(false);
  });
});
