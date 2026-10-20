import { describe, expect, it, vi } from 'vitest';
import { RunnersService } from './runners.service';

const build = () => {
  const qb = {
    update: vi.fn(),
    set: vi.fn(),
    where: vi.fn(),
    andWhere: vi.fn(),
    execute: vi.fn(() => Promise.resolve({ affected: 1 })),
  };
  for (const k of ['update', 'set', 'where', 'andWhere'] as const) {
    qb[k].mockReturnValue(qb);
  }
  const trail = { insert: vi.fn(() => Promise.resolve({})) };
  const profiles = { createQueryBuilder: vi.fn(() => qb), manager: { getRepository: vi.fn(() => trail) } };
  const service = new RunnersService(profiles as never, {} as never, {} as never, {} as never, {} as never);
  return { service, qb, trail };
};

const ping = { runnerProfileId: 'rp-1', lat: -1.28, lng: 36.82, capturedAt: new Date('2026-10-19T10:00:00Z'), trail: true };

describe('RunnersService.recordPing (RA-4, row 247 proposal)', () => {
  it('moves the last-known position forward only and keeps a job ping in the trail', async () => {
    const { service, qb, trail } = build();
    await expect(service.recordPing({ ...ping, errandId: 'e-1' })).resolves.toBe(true);
    expect(qb.set).toHaveBeenCalledWith({ currentLocation: { type: 'Point', coordinates: [36.82, -1.28] }, lastPingAt: ping.capturedAt });
    expect(qb.andWhere).toHaveBeenCalledWith('("lastPingAt" IS NULL OR "lastPingAt" < :at)', { at: ping.capturedAt });
    expect(trail.insert).toHaveBeenCalledWith(expect.objectContaining({ runnerProfileId: 'rp-1', errandId: 'e-1' }));
  });

  it('never stores an idle (errand-less) ping in the trail', async () => {
    const { service, trail } = build();
    await service.recordPing({ ...ping, errandId: null });
    expect(trail.insert).not.toHaveBeenCalled();
  });
});
