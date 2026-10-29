import { describe, expect, it, vi } from 'vitest';
import {
  RunnerPresenceService,
  WEB_PINGS_RESUMED_EVENT,
  WEB_PINGS_STOPPED_EVENT,
  presenceClientOf,
  recordOf,
  runnerPresenceKey,
  silentSince,
} from './runner-presence.service';

const NOW = new Date('2026-10-29T08:00:00.000Z');

const build = (evalResult: unknown = '', ttl?: number) => {
  const redis = {
    evalScript: vi.fn((): Promise<unknown> => Promise.resolve(evalResult)),
    hgetallMany: vi.fn((keys: string[]) => Promise.resolve(keys.map((): Record<string, string> => ({})))),
  };
  const config = { get: vi.fn((k: string, d: unknown) => (k === 'location.presenceTtlSeconds' && ttl !== undefined ? ttl : d)) };
  const events = { emit: vi.fn() };
  const service = new RunnerPresenceService(redis as never, config as never, events as never);
  return { service, redis, events };
};

describe('presenceClientOf (issue #36: handshake auth.client)', () => {
  it("is 'web' only for exactly 'web'; anything else, or nothing, is the app", () => {
    expect(presenceClientOf({ token: 't', client: 'web' })).toBe('web');
    expect(presenceClientOf({ token: 't' })).toBe('app');
    expect(presenceClientOf({ client: 'WEB' })).toBe('app');
    expect(presenceClientOf({ client: 'ios' })).toBe('app');
    expect(presenceClientOf({ client: ['web'] })).toBe('app');
    expect(presenceClientOf(undefined)).toBe('app');
    expect(presenceClientOf('web')).toBe('app');
  });
});

describe('presence record helpers', () => {
  it('parses the hash and starts the silence clock at the latest of ping, connect and online', () => {
    const r = recordOf({ client: 'web', lastPingAt: '1000', connectedAt: '3000', onlineAt: '2000', webPingsStoppedAt: '' });
    expect(r).toEqual({ client: 'web', lastPingAt: 1000, webPingsStoppedAt: null, connectedAt: 3000, onlineAt: 2000 });
    expect(silentSince(r)).toBe(3000);
    expect(recordOf({ client: 'other' }).client).toBeNull();
    expect(silentSince(recordOf({}))).toBe(0);
  });
});

describe('RunnerPresenceService (issue #36)', () => {
  it('records a ping with the client and the receipt time, 24 h TTL by default, no event when not flagged', async () => {
    const { service, redis, events } = build('');
    await service.recordPing('rp-1', 'web', NOW);
    expect(redis.evalScript).toHaveBeenCalledWith(expect.stringContaining("'lastPingAt'"), [runnerPresenceKey('rp-1')], [
      'web',
      String(NOW.getTime()),
      86_400,
    ]);
    expect(runnerPresenceKey('rp-1')).toBe('runner:presence:rp-1');
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('emits runner.web_pings_resumed when the ping cleared a flag', async () => {
    const { service, events } = build(String(NOW.getTime() - 60_000));
    await service.recordPing('rp-1', 'web', NOW);
    expect(events.emit).toHaveBeenCalledWith(WEB_PINGS_RESUMED_EVENT, { runnerProfileId: 'rp-1', at: NOW.toISOString() });
  });

  it('records a connect (configurable TTL); an app connect that cleared a web flag emits resumed', async () => {
    const { service, redis, events } = build('123', 3600);
    await service.recordConnect('rp-2', 'app', NOW);
    expect(redis.evalScript).toHaveBeenCalledWith(expect.stringContaining("'connectedAt'"), [runnerPresenceKey('rp-2')], [
      'app',
      String(NOW.getTime()),
      3600,
    ]);
    expect(events.emit).toHaveBeenCalledWith(WEB_PINGS_RESUMED_EVENT, { runnerProfileId: 'rp-2', at: NOW.toISOString() });
  });

  it('never throws on a Redis failure when writing', async () => {
    const { service, redis, events } = build();
    redis.evalScript.mockRejectedValue(new Error('down'));
    await expect(service.recordPing('rp-1', 'web', NOW)).resolves.toBeUndefined();
    await expect(service.recordConnect('rp-1', 'web', NOW)).resolves.toBeUndefined();
    await expect(service.recordAvailability('rp-1', 'offline', NOW)).resolves.toBeUndefined();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('records an availability change with no event', async () => {
    const { service, redis, events } = build(1);
    await service.recordAvailability('rp-1', 'online', NOW);
    expect(redis.evalScript).toHaveBeenCalledWith(expect.stringContaining("'onlineAt'"), [runnerPresenceKey('rp-1')], [
      'online',
      String(NOW.getTime()),
      86_400,
    ]);
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('markStopped emits runner.web_pings_stopped once with lastPingAt, or null for a never-pinged runner', async () => {
    const cutoff = new Date(NOW.getTime() - 90_000);
    const last = NOW.getTime() - 120_000;
    let { service, redis, events } = build(String(last));
    await expect(service.markStopped('rp-1', cutoff, NOW)).resolves.toBe(true);
    expect(redis.evalScript).toHaveBeenCalledWith(expect.stringContaining("'webPingsStoppedAt'"), [runnerPresenceKey('rp-1')], [
      String(cutoff.getTime()),
      String(NOW.getTime()),
      86_400,
    ]);
    expect(events.emit).toHaveBeenCalledWith(WEB_PINGS_STOPPED_EVENT, {
      runnerProfileId: 'rp-1',
      lastPingAt: new Date(last).toISOString(),
      at: NOW.toISOString(),
    });

    ({ service, events } = build(''));
    await expect(service.markStopped('rp-3', cutoff, NOW)).resolves.toBe(true);
    expect(events.emit).toHaveBeenCalledWith(WEB_PINGS_STOPPED_EVENT, { runnerProfileId: 'rp-3', lastPingAt: null, at: NOW.toISOString() });

    // Not web, already flagged or not silent: the script answers nil.
    ({ service, events } = build(null));
    await expect(service.markStopped('rp-4', cutoff, NOW)).resolves.toBe(false);
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('admin views: ISO times, empty presence without a record, and empty presence when Redis fails', async () => {
    const { service, redis } = build();
    redis.hgetallMany.mockResolvedValueOnce([
      { client: 'web', lastPingAt: String(NOW.getTime()), webPingsStoppedAt: String(NOW.getTime() + 1000), connectedAt: '1' },
      {},
    ]);
    const views = await service.viewsOf(['rp-1', 'rp-2']);
    expect(views.get('rp-1')).toEqual({
      client: 'web',
      lastPingAt: NOW.toISOString(),
      webPingsStoppedAt: new Date(NOW.getTime() + 1000).toISOString(),
    });
    expect(views.get('rp-2')).toEqual({ client: null, lastPingAt: null, webPingsStoppedAt: null });

    redis.hgetallMany.mockRejectedValueOnce(new Error('down'));
    expect((await service.viewsOf(['rp-1'])).size).toBe(0);
    expect((await service.viewsOf([])).size).toBe(0);
  });
});
