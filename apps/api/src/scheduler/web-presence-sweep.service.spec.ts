import { describe, expect, it, vi } from 'vitest';
import { RunnerAvailability } from '../common/enums';
import { PresenceRecord, WEB_AUTO_OFFLINE_EVENT } from '../runners/runner-presence.service';
import { WebPresenceSweepService } from './web-presence-sweep.service';

const NOW = new Date('2026-10-29T08:00:00.000Z');
const ago = (s: number) => NOW.getTime() - s * 1000;

const rec = (r: Partial<PresenceRecord>): PresenceRecord => ({
  client: 'web',
  lastPingAt: null,
  webPingsStoppedAt: null,
  connectedAt: null,
  onlineAt: null,
  ...r,
});

const build = (opts: {
  runners: { id: string; availability: RunnerAvailability }[];
  records: Record<string, PresenceRecord | null>;
  openOffer?: string[];
  stale?: number;
  offline?: number;
}) => {
  const pages = [opts.runners];
  const runners = {
    activeRunnersPage: vi.fn(() => Promise.resolve(pages.shift() ?? [])),
    setOfflineBySystem: vi.fn(async (_id: string, canGo: (m: unknown) => Promise<boolean>) => canGo({})),
  };
  const errands = {
    openOffersFor: vi.fn((id: string) => Promise.resolve({ items: opts.openOffer?.includes(id) ? [{}] : [], nextCursor: null })),
  };
  const presence = {
    recordsOf: vi.fn((ids: string[]) => Promise.resolve(ids.map((id) => opts.records[id] ?? null))),
    recordOf: vi.fn((id: string) => Promise.resolve(opts.records[id] ?? null)),
    markStopped: vi.fn(() => Promise.resolve(true)),
  };
  const config = {
    get: vi.fn((k: string, d: unknown) =>
      k === 'location.webStaleSeconds' ? (opts.stale ?? d) : k === 'location.webOfflineSeconds' ? (opts.offline ?? d) : d,
    ),
  };
  const events = { emit: vi.fn() };
  const service = new WebPresenceSweepService(runners as never, errands as never, presence as never, config as never, events as never);
  return { service, runners, errands, presence, events };
};

const ONLINE = RunnerAvailability.ONLINE;
const BUSY = RunnerAvailability.BUSY;

describe('WebPresenceSweepService (issue #36, owner Q14-5, Q14-6)', () => {
  it('flags a web runner silent for more than 90 s, once, with the cutoff', async () => {
    const { service, presence, runners } = build({
      runners: [{ id: 'rp-1', availability: ONLINE }],
      records: { 'rp-1': rec({ lastPingAt: ago(91) }) },
    });
    await expect(service.sweep(NOW)).resolves.toEqual({ flagged: ['rp-1'], offlined: [] });
    expect(presence.markStopped).toHaveBeenCalledWith('rp-1', new Date(ago(90)), NOW);
    expect(runners.setOfflineBySystem).not.toHaveBeenCalled();
  });

  it('does not flag before the threshold, or a runner already flagged', async () => {
    const { service, presence } = build({
      runners: [
        { id: 'rp-1', availability: ONLINE },
        { id: 'rp-2', availability: ONLINE },
      ],
      records: { 'rp-1': rec({ lastPingAt: ago(89) }), 'rp-2': rec({ lastPingAt: ago(120), webPingsStoppedAt: ago(30) }) },
    });
    await expect(service.sweep(NOW)).resolves.toEqual({ flagged: [], offlined: [] });
    expect(presence.markStopped).not.toHaveBeenCalled();
  });

  it('flags a never-pinged web runner from their connect or online time', async () => {
    const { service } = build({
      runners: [
        { id: 'rp-1', availability: ONLINE },
        { id: 'rp-2', availability: ONLINE },
      ],
      records: { 'rp-1': rec({ connectedAt: ago(100) }), 'rp-2': rec({ connectedAt: ago(200), onlineAt: ago(30) }) },
    });
    await expect(service.sweep(NOW)).resolves.toEqual({ flagged: ['rp-1'], offlined: [] });
  });

  it('never touches app runners or runners without a record', async () => {
    const { service, presence, runners } = build({
      runners: [
        { id: 'rp-app', availability: ONLINE },
        { id: 'rp-none', availability: ONLINE },
      ],
      records: { 'rp-app': rec({ client: 'app', lastPingAt: ago(3600) }) },
    });
    await expect(service.sweep(NOW)).resolves.toEqual({ flagged: [], offlined: [] });
    expect(presence.markStopped).not.toHaveBeenCalled();
    expect(runners.setOfflineBySystem).not.toHaveBeenCalled();
  });

  it('sets an idle online web runner offline after 300 s and tells ops', async () => {
    const { service, runners, events } = build({
      runners: [{ id: 'rp-1', availability: ONLINE }],
      records: { 'rp-1': rec({ lastPingAt: ago(301), webPingsStoppedAt: ago(200) }) },
    });
    await expect(service.sweep(NOW)).resolves.toEqual({ flagged: [], offlined: ['rp-1'] });
    expect(runners.setOfflineBySystem).toHaveBeenCalledWith('rp-1', expect.any(Function));
    expect(events.emit).toHaveBeenCalledWith(WEB_AUTO_OFFLINE_EVENT, {
      runnerProfileId: 'rp-1',
      lastPingAt: new Date(ago(301)).toISOString(),
      at: NOW.toISOString(),
    });
  });

  it('flags a busy web runner but never sets them offline', async () => {
    const { service, runners } = build({
      runners: [{ id: 'rp-1', availability: BUSY }],
      records: { 'rp-1': rec({ lastPingAt: ago(3600) }) },
    });
    await expect(service.sweep(NOW)).resolves.toEqual({ flagged: ['rp-1'], offlined: [] });
    expect(runners.setOfflineBySystem).not.toHaveBeenCalled();
  });

  it('keeps a runner with an open offer online (flag only)', async () => {
    const { service, runners } = build({
      runners: [{ id: 'rp-1', availability: ONLINE }],
      records: { 'rp-1': rec({ lastPingAt: ago(600) }) },
      openOffer: ['rp-1'],
    });
    await expect(service.sweep(NOW)).resolves.toEqual({ flagged: ['rp-1'], offlined: [] });
    expect(runners.setOfflineBySystem).not.toHaveBeenCalled();
  });

  it('the in-lock re-check keeps a runner who pinged meanwhile online', async () => {
    const b = build({
      runners: [{ id: 'rp-1', availability: ONLINE }],
      records: { 'rp-1': rec({ lastPingAt: ago(400), webPingsStoppedAt: ago(300) }) },
    });
    b.presence.recordOf.mockResolvedValueOnce(rec({ lastPingAt: ago(5) }));
    await expect(b.service.sweep(NOW)).resolves.toEqual({ flagged: [], offlined: [] });
    expect(b.runners.setOfflineBySystem).toHaveBeenCalled();
    expect(b.events.emit).not.toHaveBeenCalled();
  });

  it('uses the configured thresholds', async () => {
    const { service } = build({
      runners: [{ id: 'rp-1', availability: ONLINE }],
      records: { 'rp-1': rec({ lastPingAt: ago(50) }) },
      stale: 30,
      offline: 45,
    });
    await expect(service.sweep(NOW)).resolves.toEqual({ flagged: ['rp-1'], offlined: ['rp-1'] });
  });

  it('pages through the active runners by id and goes on after a failure on one runner', async () => {
    const b = build({ runners: [], records: { 'rp-1': rec({ lastPingAt: ago(100) }), 'rp-2': rec({ lastPingAt: ago(100) }) } });
    b.runners.activeRunnersPage
      .mockResolvedValueOnce([{ id: 'rp-1', availability: BUSY }])
      .mockResolvedValueOnce([{ id: 'rp-2', availability: BUSY }])
      .mockResolvedValueOnce([]);
    b.presence.markStopped.mockRejectedValueOnce(new Error('down'));
    await expect(b.service.sweep(NOW, 1)).resolves.toEqual({ flagged: ['rp-2'], offlined: [] });
    expect(b.runners.activeRunnersPage).toHaveBeenNthCalledWith(1, null, 1);
    expect(b.runners.activeRunnersPage).toHaveBeenNthCalledWith(2, 'rp-1', 1);
  });
});
