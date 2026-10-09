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
    lastKnownLocation: vi.fn(() =>
      Promise.resolve({ lat: -4.05, lng: 39.66, capturedAt: new Date('2026-10-07T08:00:00Z') }),
    ),
  };
  return { service: new LocationService(errands as never, runners as never), errands, runners };
};

const viewer = { role: 'customer', userId: 'u-1' };

describe('LocationService.trackingFor (A-3)', () => {
  it('returns points, runner and last-known position while live', async () => {
    const { service, runners } = build(ErrandStatus.RUNNER_EN_ROUTE);

    const snap = await service.trackingFor('e-1', viewer);

    expect(runners.lastKnownLocation).toHaveBeenCalledWith('runner-1');
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
    expect(runners.lastKnownLocation).not.toHaveBeenCalled();
  });

  it('has no runner before assignment', async () => {
    const { service } = build(ErrandStatus.PAYMENT_CONFIRMED, false);
    const snap = await service.trackingFor('e-1', viewer);
    expect(snap.runner).toBeNull();
    expect(snap.runnerLocation).toBeNull();
  });
});
