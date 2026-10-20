import { describe, expect, it, vi } from 'vitest';
import {
  AssignmentStatus,
  ErrandPointType,
  ErrandStatus,
  VerificationLevel,
} from '../common/enums';
import { LocationService } from './location.service';

const runner = {
  id: 'runner-1',
  verificationLevel: VerificationLevel.ONE_BASIC,
  avgRating: '4.50',
  errandsCompleted: 3,
};

const build = (status: ErrandStatus, withRunner = true) => {
  const errands = {
    getDetail: vi.fn(() =>
      Promise.resolve({
        id: 'e-1',
        status,
        assignment: withRunner
          ? { id: 'a-1', status: AssignmentStatus.ASSIGNED, assignedAt: new Date(), runner }
          : null,
      }),
    ),
    locationsFor: vi.fn(() =>
      Promise.resolve([
        {
          pointType: ErrandPointType.TASK_SITE,
          coordinates: { type: 'Point', coordinates: [39.67, -4.04] },
          addressText: 'Nyali, Mombasa',
        },
      ]),
    ),
  };
  const runners = {
    lastJobLocation: vi.fn(() =>
      Promise.resolve({ lat: -4.05, lng: 39.66, capturedAt: new Date('2026-10-07T08:00:00Z') }),
    ),
  };
  return { service: new LocationService(errands as never, runners as never), errands, runners };
};

const viewer = { role: 'customer', userId: 'u-1' };

describe('LocationService.trackingFor (A-3)', () => {
  it('returns points, runner and the newest job sample while live (row 247)', async () => {
    const { service, runners } = build(ErrandStatus.RUNNER_EN_ROUTE);

    const snap = await service.trackingFor('e-1', viewer);

    expect(runners.lastJobLocation).toHaveBeenCalledWith('runner-1', 'e-1');
    expect(snap).toEqual({
      errandId: 'e-1',
      status: ErrandStatus.RUNNER_EN_ROUTE,
      live: true,
      points: [
        { pointType: ErrandPointType.TASK_SITE, lat: -4.04, lng: 39.67, addressText: 'Nyali, Mombasa' },
      ],
      runner,
      runnerLocation: { lat: -4.05, lng: 39.66, capturedAt: new Date('2026-10-07T08:00:00Z') },
      eta: null,
    });
  });

  it('withholds the runner position outside live states', async () => {
    const { service, runners } = build(ErrandStatus.SETTLED);
    const snap = await service.trackingFor('e-1', viewer);
    expect(snap.live).toBe(false);
    expect(snap.runnerLocation).toBeNull();
    expect(runners.lastJobLocation).not.toHaveBeenCalled();
  });

  it('has no runner before assignment', async () => {
    const { service } = build(ErrandStatus.PAYMENT_CONFIRMED, false);
    const snap = await service.trackingFor('e-1', viewer);
    expect(snap.runner).toBeNull();
    expect(snap.runnerLocation).toBeNull();
  });
});

describe('LocationService.trackingFor live position (RA-4, row 247)', () => {
  it('prefers the Redis live position over runner_profiles', async () => {
    const { errands, runners } = build(ErrandStatus.IN_PROGRESS);
    const live = { liveFor: vi.fn(() => Promise.resolve({ lat: -1.1, lng: 36.9, capturedAt: new Date('2026-10-19T10:00:00Z') })) };
    const service = new LocationService(errands as never, runners as never, live as never);
    const snap = await service.trackingFor('e-1', viewer);
    expect(live.liveFor).toHaveBeenCalledWith('runner-1');
    expect(snap.runnerLocation).toEqual({ lat: -1.1, lng: 36.9, capturedAt: new Date('2026-10-19T10:00:00Z') });
    expect(runners.lastJobLocation).not.toHaveBeenCalled();
  });

  it('falls back to the last-known value when Redis has none', async () => {
    const { errands, runners } = build(ErrandStatus.IN_PROGRESS);
    const live = { liveFor: vi.fn(() => Promise.resolve(null)) };
    const service = new LocationService(errands as never, runners as never, live as never);
    const snap = await service.trackingFor('e-1', viewer);
    expect(snap.runnerLocation?.lat).toBe(-4.05);
  });
});
