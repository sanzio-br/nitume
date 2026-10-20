import { describe, expect, it, vi } from 'vitest';
import { LocationRetentionService } from './location-retention.service';

const NOW = new Date('2026-10-20T00:30:00Z');

const build = (opts: { pages: string[][]; ended: string[]; held?: string[]; days?: number }) => {
  const pages = [...opts.pages];
  const runners = {
    errandsWithLocationSamples: vi.fn(() => Promise.resolve(pages.shift() ?? [])),
    deleteLocationSamples: vi.fn((ids: string[]) => Promise.resolve(ids.length * 3)),
  };
  const errands = { endedBefore: vi.fn((ids: string[]) => Promise.resolve(ids.filter((id) => opts.ended.includes(id)))) };
  const disputes = { errandsWithOpenDisputes: vi.fn((ids: string[]) => Promise.resolve(new Set(ids.filter((id) => opts.held?.includes(id))))) };
  const config = { get: vi.fn((k: string, d: unknown) => (k === 'location.retentionDays' && opts.days !== undefined ? opts.days : d)) };
  const service = new LocationRetentionService(runners as never, errands as never, disputes as never, config as never);
  return { service, runners, errands, disputes };
};

describe('LocationRetentionService (row 247)', () => {
  it('deletes the samples of tasks that ended more than 90 days ago, by default', async () => {
    const { service, runners, errands } = build({ pages: [['e-1', 'e-2', 'e-3']], ended: ['e-1', 'e-3'] });
    await expect(service.purgeExpired(NOW, 500)).resolves.toEqual({ errandIds: ['e-1', 'e-3'], deleted: 6 });
    expect(errands.endedBefore).toHaveBeenCalledWith(['e-1', 'e-2', 'e-3'], new Date(NOW.getTime() - 90 * 86_400_000));
    expect(runners.deleteLocationSamples).toHaveBeenCalledWith(['e-1', 'e-3']);
  });

  it('keeps a task with an open dispute', async () => {
    const { service, runners, disputes } = build({ pages: [['e-1', 'e-2']], ended: ['e-1', 'e-2'], held: ['e-2'] });
    await expect(service.purgeExpired(NOW, 500)).resolves.toMatchObject({ errandIds: ['e-1'] });
    expect(disputes.errandsWithOpenDisputes).toHaveBeenCalledWith(['e-1', 'e-2']);
    expect(runners.deleteLocationSamples).toHaveBeenCalledWith(['e-1']);
  });

  it('uses the configured period and pages by task id', async () => {
    const { service, runners, errands } = build({ pages: [['e-1', 'e-2'], ['e-3']], ended: ['e-3'], days: 30 });
    await expect(service.purgeExpired(NOW, 2)).resolves.toEqual({ errandIds: ['e-3'], deleted: 3 });
    expect(runners.errandsWithLocationSamples).toHaveBeenNthCalledWith(1, null, 2);
    expect(runners.errandsWithLocationSamples).toHaveBeenNthCalledWith(2, 'e-2', 2);
    expect(errands.endedBefore).toHaveBeenLastCalledWith(['e-3'], new Date(NOW.getTime() - 30 * 86_400_000));
  });

  it('falls back to 90 days on an invalid period', () => {
    expect(build({ pages: [], ended: [], days: 0 }).service.retentionDays()).toBe(90);
  });
});
