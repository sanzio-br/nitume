import { describe, expect, it, vi } from 'vitest';
import { RunnersService } from './runners.service';

const build = () => {
  const qb = {
    update: vi.fn(),
    set: vi.fn(),
    where: vi.fn(),
    andWhere: vi.fn(),
    select: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    getRawMany: vi.fn(() => Promise.resolve([{ errandId: 'e-1' }, { errandId: 'e-2' }])),
    execute: vi.fn(() => Promise.resolve({ affected: 1 })),
  };
  for (const k of ['update', 'set', 'where', 'andWhere', 'select', 'orderBy', 'limit'] as const) {
    qb[k].mockReturnValue(qb);
  }
  const trail = {
    insert: vi.fn(() => Promise.resolve({})),
    findOne: vi.fn(() =>
      Promise.resolve({ coordinates: { type: 'Point', coordinates: [36.82, -1.28] }, capturedAt: new Date('2026-10-19T10:00:00Z') }),
    ),
    delete: vi.fn(() => Promise.resolve({ affected: 7 })),
    createQueryBuilder: vi.fn(() => qb),
  };
  const profiles = { createQueryBuilder: vi.fn(() => qb), manager: { getRepository: vi.fn(() => trail) } };
  const service = new RunnersService(profiles as never, {} as never, {} as never, {} as never, {} as never);
  return { service, qb, trail };
};

const ping = { runnerProfileId: 'rp-1', lat: -1.28, lng: 36.82, capturedAt: new Date('2026-10-19T10:00:00Z'), trail: true };

describe('RunnersService.recordPing (RA-4, row 247)', () => {
  it('moves lastPingAt forward only, keeps no position on the profile, and stores the job sample with its task', async () => {
    const { service, qb, trail } = build();
    await expect(service.recordPing({ ...ping, errandId: 'e-1' })).resolves.toBe(true);
    expect(qb.set).toHaveBeenCalledWith({ lastPingAt: ping.capturedAt });
    expect(qb.andWhere).toHaveBeenCalledWith('("lastPingAt" IS NULL OR "lastPingAt" < :at)', { at: ping.capturedAt });
    expect(trail.insert).toHaveBeenCalledWith({
      runnerProfileId: 'rp-1',
      errandId: 'e-1',
      coordinates: { type: 'Point', coordinates: [36.82, -1.28] },
      capturedAt: ping.capturedAt,
    });
  });

  it('stores no sample for a non-trail ping', async () => {
    const { service, trail } = build();
    await service.recordPing({ ...ping, errandId: 'e-1', trail: false });
    expect(trail.insert).not.toHaveBeenCalled();
  });
});

describe('RunnersService job location samples (row 247)', () => {
  it('lastJobLocation reads the newest sample of the runner on that task', async () => {
    const { service, trail } = build();
    await expect(service.lastJobLocation('rp-1', 'e-1')).resolves.toEqual({
      lat: -1.28,
      lng: 36.82,
      capturedAt: new Date('2026-10-19T10:00:00Z'),
    });
    expect(trail.findOne).toHaveBeenCalledWith({ where: { runnerProfileId: 'rp-1', errandId: 'e-1' }, order: { capturedAt: 'DESC' } });
  });
});
