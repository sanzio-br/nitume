import { describe, expect, it, vi } from 'vitest';
import {
  AssignmentStatus,
  ErrandCategory,
  ErrandPointType,
  ErrandStatus,
  RunnerAvailability,
  UserRole,
} from '../common/enums';
import {
  LocationIngestService,
  RUNNER_GEO_KEY,
  arrivalPointOf,
  parsePing,
  runnerLiveKey,
} from './location-ingest.service';

const ERRAND = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const NOW = new Date('2026-10-19T10:00:00.000Z');
const runnerUser = { userId: 'u-r1', role: UserRole.RUNNER, phone: '+254700000000', status: 'active' } as never;

const build = (opts: {
  status?: ErrandStatus;
  category?: ErrandCategory;
  holder?: { runnerProfileId: string; status: AssignmentStatus } | null;
  availability?: RunnerAvailability;
  throttleFree?: boolean;
  within?: boolean;
  count?: number;
  persist?: boolean;
} = {}) => {
  const errands = {
    findByIds: vi.fn(() =>
      Promise.resolve([{ id: ERRAND, status: opts.status ?? ErrandStatus.RUNNER_EN_ROUTE, category: opts.category ?? ErrandCategory.INSPECTION }]),
    ),
    activeAssignmentFor: vi.fn(() =>
      Promise.resolve(opts.holder === undefined ? { runnerProfileId: 'rp-1', status: AssignmentStatus.ACCEPTED } : opts.holder),
    ),
    locationsFor: vi.fn(() => Promise.resolve([{ id: 'loc-site', pointType: ErrandPointType.TASK_SITE }])),
    isWithinPoint: vi.fn(() => Promise.resolve(opts.within ?? false)),
  };
  const runners = {
    profileByUserId: vi.fn(() => Promise.resolve({ id: 'rp-1', availability: opts.availability ?? RunnerAvailability.BUSY })),
  };
  const redis = {
    setIfAbsentMs: vi.fn(() => Promise.resolve(opts.throttleFree ?? true)),
    geoAdd: vi.fn(() => Promise.resolve()),
    set: vi.fn(() => Promise.resolve()),
    publish: vi.fn(() => Promise.resolve(1)),
    channel: vi.fn((n: string) => `pfx:${n}`),
    incrementWithTtl: vi.fn(() => Promise.resolve(opts.count ?? 1)),
    get: vi.fn(() => Promise.resolve(null as string | null)),
  };
  const queue = { add: vi.fn(() => Promise.resolve({})) };
  const config = { get: vi.fn((k: string, d: unknown) => (k === 'location.persistEnabled' ? (opts.persist ?? false) : d)) };
  const service = new LocationIngestService(errands as never, runners as never, redis as never, queue as never, config as never);
  return { service, errands, runners, redis, queue };
};

const ping = (extra: Record<string, unknown> = {}) => ({ lat: -1.2921, lng: 36.8219, ...extra });

describe('parsePing (RA-4 payload)', () => {
  it('accepts { lat, lng, errandId, accuracy, ts }', () => {
    const p = parsePing(ping({ errandId: ERRAND.toUpperCase(), accuracy: 12.5, ts: '2026-10-19T09:59:55.000Z' }), NOW);
    expect(p).toEqual({
      lat: -1.2921,
      lng: 36.8219,
      errandId: ERRAND,
      accuracy: 12.5,
      capturedAt: new Date('2026-10-19T09:59:55.000Z'),
    });
  });

  it('defaults capturedAt to the server time and clamps a slightly fast device clock', () => {
    expect(parsePing(ping(), NOW)?.capturedAt).toEqual(NOW);
    expect(parsePing(ping({ ts: '2026-10-19T10:00:10.000Z' }), NOW)?.capturedAt).toEqual(NOW);
  });

  it.each([
    ['no body', undefined],
    ['array', [1, 2]],
    ['string lat', { lat: '1', lng: 2 }],
    ['NaN', { lat: Number.NaN, lng: 2 }],
    ['lat out of range', { lat: 91, lng: 2 }],
    ['lng out of range', { lat: 1, lng: -181 }],
    ['bad errand id', { lat: 1, lng: 2, errandId: 'x' }],
    ['negative accuracy', { lat: 1, lng: 2, accuracy: -1 }],
    ['bad ts', { lat: 1, lng: 2, ts: 'yesterday' }],
    ['ts far in the future', { lat: 1, lng: 2, ts: '2026-10-19T10:05:00.000Z' }],
  ])('rejects %s', (_label, body) => {
    expect(parsePing(body, NOW)).toBeNull();
  });
});

describe('arrivalPointOf (§4.3)', () => {
  const pts = [
    { id: 'drop', pointType: ErrandPointType.DROPOFF },
    { id: 'pick', pointType: ErrandPointType.PICKUP },
    { id: 'site', pointType: ErrandPointType.TASK_SITE },
  ];
  it('uses the pickup first on Buy For Me and Get It For Me', () => {
    expect(arrivalPointOf(ErrandCategory.BUY_FOR_ME, pts)?.id).toBe('pick');
    expect(arrivalPointOf(ErrandCategory.PICKUP_DELIVERY, pts)?.id).toBe('pick');
  });
  it('uses the task site otherwise, then pickup, then drop-off', () => {
    expect(arrivalPointOf(ErrandCategory.INSPECTION, pts)?.id).toBe('site');
    expect(arrivalPointOf(ErrandCategory.INSPECTION, pts.slice(0, 2))?.id).toBe('pick');
    expect(arrivalPointOf(ErrandCategory.QUEUE_ADMIN, pts.slice(0, 1))?.id).toBe('drop');
    expect(arrivalPointOf(ErrandCategory.BUY_FOR_ME, [])).toBeNull();
  });
});

describe('LocationIngestService.ingest (RA-4)', () => {
  it('stores, publishes and queues a job ping from the accepted runner', async () => {
    const { service, redis, queue } = build({ count: 1, persist: true });
    const ack = await service.ingest(runnerUser, ping({ errandId: ERRAND, accuracy: 8 }), NOW);
    expect(ack).toEqual({ ok: true, status: ErrandStatus.RUNNER_EN_ROUTE });
    expect(redis.setIfAbsentMs).toHaveBeenCalledWith('location:throttle:u-r1', '1', 2000);
    expect(redis.geoAdd).toHaveBeenCalledWith(RUNNER_GEO_KEY, 36.8219, -1.2921, 'rp-1');
    expect(redis.set).toHaveBeenCalledWith(runnerLiveKey('rp-1'), expect.any(String), 60);
    expect(redis.publish).toHaveBeenCalledWith(`pfx:location:errand:${ERRAND}`, expect.any(String));
    const message = JSON.parse((redis.publish.mock.calls[0] as unknown as [string, string])[1]) as Record<string, unknown>;
    expect(message).toEqual({
      errandId: ERRAND,
      runnerProfileId: 'rp-1',
      lat: -1.2921,
      lng: 36.8219,
      accuracy: 8,
      ts: NOW.toISOString(),
    });
    expect(queue.add).toHaveBeenCalledWith(
      'location-persist',
      { runnerProfileId: 'rp-1', errandId: ERRAND, lat: -1.2921, lng: 36.8219, capturedAt: NOW.toISOString(), trail: true },
      expect.objectContaining({ attempts: 1, removeOnComplete: true }),
    );
  });

  it('writes nothing to PostgreSQL while persistence is off (row 247)', async () => {
    const { service, redis, queue } = build();
    await expect(service.ingest(runnerUser, ping({ errandId: ERRAND }), NOW)).resolves.toEqual({ ok: true, status: ErrandStatus.RUNNER_EN_ROUTE });
    expect(redis.set).toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('reads the live position back from Redis', async () => {
    const { service, redis } = build();
    redis.get.mockResolvedValueOnce(JSON.stringify({ lat: 1, lng: 2, ts: NOW.toISOString() }));
    await expect(service.liveFor('rp-1')).resolves.toEqual({ lat: 1, lng: 2, capturedAt: NOW });
    expect(redis.get).toHaveBeenCalledWith(runnerLiveKey('rp-1'));
    await expect(service.liveFor('rp-1')).resolves.toBeNull();
  });

  it('keeps only every 10th ping in the trail', async () => {
    const { service, queue } = build({ count: 5, persist: true });
    await service.ingest(runnerUser, ping({ errandId: ERRAND }), NOW);
    expect((queue.add.mock.calls[0] as unknown as [string, { trail: boolean }])[1].trail).toBe(false);
  });

  it('never fans out an errand-less (online) ping', async () => {
    const { service, redis, queue, errands } = build({ availability: RunnerAvailability.ONLINE, persist: true });
    await expect(service.ingest(runnerUser, ping(), NOW)).resolves.toEqual({ ok: true });
    expect(redis.publish).not.toHaveBeenCalled();
    expect(errands.findByIds).not.toHaveBeenCalled();
    expect(redis.geoAdd).toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledWith('location-persist', expect.objectContaining({ errandId: null }), expect.anything());
  });

  it('refuses non-runners and malformed or stale pings before any Redis write', async () => {
    const { service, redis } = build();
    await expect(service.ingest({ ...(runnerUser as object), role: UserRole.CUSTOMER } as never, ping(), NOW)).resolves.toEqual({
      ok: false,
      error: 'not_runner',
    });
    await expect(service.ingest(runnerUser, { lat: 'x' }, NOW)).resolves.toEqual({ ok: false, error: 'invalid_payload' });
    await expect(service.ingest(runnerUser, ping({ ts: '2026-10-19T09:58:00.000Z' }), NOW)).resolves.toEqual({
      ok: false,
      error: 'stale_ping',
    });
    expect(redis.setIfAbsentMs).not.toHaveBeenCalled();
  });

  it('drops pings faster than the minimum interval', async () => {
    const { service, redis } = build({ throttleFree: false });
    await expect(service.ingest(runnerUser, ping(), NOW)).resolves.toEqual({ ok: false, error: 'rate_limited' });
    expect(redis.geoAdd).not.toHaveBeenCalled();
  });

  it('ignores an offline runner (row 123)', async () => {
    const { service, redis } = build({ availability: RunnerAvailability.OFFLINE });
    await expect(service.ingest(runnerUser, ping(), NOW)).resolves.toEqual({ ok: false, error: 'runner_offline' });
    expect(redis.geoAdd).not.toHaveBeenCalled();
  });

  it.each([
    ['another runner holds the job', { runnerProfileId: 'rp-2', status: AssignmentStatus.ACCEPTED }],
    ['an open offer only (row 183)', { runnerProfileId: 'rp-1', status: AssignmentStatus.ASSIGNED }],
    ['no current assignment', null],
  ])('refuses a job ping when %s', async (_label, holder) => {
    const { service, redis } = build({ status: ErrandStatus.RUNNER_ASSIGNED, holder });
    await expect(service.ingest(runnerUser, ping({ errandId: ERRAND }), NOW)).resolves.toEqual({ ok: false, error: 'forbidden' });
    expect(redis.publish).not.toHaveBeenCalled();
  });

  it.each([ErrandStatus.AWAITING_CUSTOMER, ErrandStatus.CANCELLED, ErrandStatus.DISPUTED])(
    'stops at %s with not_live and the status',
    async (status) => {
      const { service, redis } = build({ status });
      await expect(service.ingest(runnerUser, ping({ errandId: ERRAND }), NOW)).resolves.toEqual({
        ok: false,
        error: 'not_live',
        status,
      });
      expect(redis.publish).not.toHaveBeenCalled();
      expect(redis.geoAdd).not.toHaveBeenCalled();
    },
  );

  it('answers unavailable (and never throws) when Redis fails', async () => {
    const { service, redis } = build();
    redis.setIfAbsentMs.mockRejectedValueOnce(new Error('down'));
    await expect(service.ingest(runnerUser, ping(), NOW)).resolves.toEqual({ ok: false, error: 'unavailable' });
  });

  it('caches the job between pings and re-reads it after a status change', async () => {
    const { service, errands } = build();
    await service.ingest(runnerUser, ping({ errandId: ERRAND }), NOW);
    await service.ingest(runnerUser, ping({ errandId: ERRAND }), new Date(NOW.getTime() + 4000));
    expect(errands.findByIds).toHaveBeenCalledTimes(1);
    service.onStatusChanged({ errandId: ERRAND });
    await service.ingest(runnerUser, ping({ errandId: ERRAND }), new Date(NOW.getTime() + 8000));
    expect(errands.findByIds).toHaveBeenCalledTimes(2);
  });
});

describe('LocationIngestService geofence (§4.3)', () => {
  it('queues one system arrival inside the radius while RUNNER_EN_ROUTE', async () => {
    const { service, errands, queue } = build({ within: true });
    await service.ingest(runnerUser, ping({ errandId: ERRAND, accuracy: 20 }), NOW);
    expect(errands.isWithinPoint).toHaveBeenCalledWith('loc-site', -1.2921, 36.8219, 100);
    expect(queue.add).toHaveBeenCalledWith(
      'geofence-arrival',
      { errandId: ERRAND, runnerProfileId: 'rp-1', lat: -1.2921, lng: 36.8219 },
      expect.objectContaining({ jobId: `geofence-arrival-${ERRAND}` }),
    );
    await service.ingest(runnerUser, ping({ errandId: ERRAND }), new Date(NOW.getTime() + 4000));
    expect(errands.isWithinPoint).toHaveBeenCalledTimes(1);
  });

  it('does not queue outside the radius', async () => {
    const { service, queue } = build({ within: false });
    await service.ingest(runnerUser, ping({ errandId: ERRAND }), NOW);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('never auto-arrives on a fix less precise than the radius', async () => {
    const { service, errands } = build({ within: true });
    await service.ingest(runnerUser, ping({ errandId: ERRAND, accuracy: 250 }), NOW);
    expect(errands.isWithinPoint).not.toHaveBeenCalled();
  });

  it('only checks while RUNNER_EN_ROUTE', async () => {
    const { service, errands } = build({ status: ErrandStatus.IN_PROGRESS, within: true });
    await service.ingest(runnerUser, ping({ errandId: ERRAND }), NOW);
    expect(errands.isWithinPoint).not.toHaveBeenCalled();
    expect(errands.locationsFor).not.toHaveBeenCalled();
  });
});
