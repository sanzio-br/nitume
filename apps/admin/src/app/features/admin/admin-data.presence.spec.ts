import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { API, flushAsync, setupHttp, timeZoneSwitch } from '../../testing/admin-test-utils';
import { FakeRealtime } from '../../testing/fake-realtime';
import {
  OFFLINE_AT,
  PING_AT,
  RUNNER_ID,
  RUNNER_SHORT,
  STOP_AT,
  flushRefresh,
  runnerFixture,
} from '../../testing/runner-fixtures';
import { AdminDataService } from './admin-data.service';
import { isFlagged } from './runner-presence';

describe('AdminDataService web runner presence (#36, spec §5)', () => {
  const zone = timeZoneSwitch('Europe/London');
  beforeAll(zone.pin);
  afterAll(zone.restore);

  let http: HttpTestingController;
  let s: AdminDataService;
  let rt: FakeRealtime;

  beforeEach(() => {
    http = setupHttp();
    s = TestBed.inject(AdminDataService);
    rt = new FakeRealtime();
    s.attachLive(rt);
  });
  afterEach(() => http.verify());

  const runner = () => s.runners().find((r) => r.id === RUNNER_ID)!;

  it('web_pings_stopped flags the runner and adds an amber row with the last ping', () => {
    s.runners.set([runnerFixture({ availability: 'busy' }, { client: null, lastPingAt: null })]);
    rt.stopped.next({ runnerProfileId: RUNNER_ID, lastPingAt: PING_AT, at: STOP_AT });
    expect(runner().presence).toEqual({
      client: 'web',
      lastPingAt: PING_AT,
      webPingsStoppedAt: STOP_AT,
    });
    expect(isFlagged(runner())).toBe(true);
    expect(s.feed()[0]).toEqual({
      tone: 'amber',
      title: `Web pings stopped — ${RUNNER_SHORT}`,
      sub: 'Last ping 2:01 PM · 2:03 PM',
      runnerId: RUNNER_ID,
    });
    expect(s.mapPoints()[0]).toMatchObject({ web: true, pingsStopped: true });
  });

  it('a never-pinged runner reads "No location received"', () => {
    s.runners.set([runnerFixture()]);
    rt.stopped.next({ runnerProfileId: RUNNER_ID, lastPingAt: null, at: STOP_AT });
    expect(s.feed()[0].sub).toBe('No location received · 2:03 PM');
    expect(runner().presence?.lastPingAt).toBeNull();
  });

  it('resumed clears the flag only, and adds a slate row', () => {
    s.runners.set([runnerFixture({}, { client: 'web', webPingsStoppedAt: STOP_AT })]);
    rt.resumed.next({ runnerProfileId: RUNNER_ID, at: OFFLINE_AT });
    expect(runner().presence).toEqual({
      client: 'web',
      lastPingAt: PING_AT,
      webPingsStoppedAt: null,
    });
    expect(s.feed()[0]).toEqual({
      tone: 'slate',
      title: `Web pings resumed — ${RUNNER_SHORT}`,
      sub: '2:06 PM',
      runnerId: RUNNER_ID,
    });
  });

  it('auto_offline sets offline, clears the flag, records the notice and adds a slate row', () => {
    s.runners.set([runnerFixture({}, { webPingsStoppedAt: STOP_AT })]);
    rt.offline.next({ runnerProfileId: RUNNER_ID, lastPingAt: PING_AT, at: OFFLINE_AT });
    expect(runner().availability).toBe('offline');
    expect(runner().presence).toEqual({
      client: 'web',
      lastPingAt: PING_AT,
      webPingsStoppedAt: null,
    });
    expect(s.autoOffline().get(RUNNER_ID)).toEqual({ at: OFFLINE_AT, lastPingAt: PING_AT });
    expect(s.feed()[0]).toEqual({
      tone: 'slate',
      title: `Set offline, no web pings — ${RUNNER_SHORT}`,
      sub: 'Last ping 2:01 PM · 2:06 PM',
      runnerId: RUNNER_ID,
    });
    expect(s.mapPoints()[0]).toMatchObject({
      availability: 'offline',
      web: false,
      pingsStopped: false,
    });
    // A null lastPingAt keeps the time the runner had.
    s.runners.set([runnerFixture()]);
    rt.offline.next({ runnerProfileId: RUNNER_ID, lastPingAt: null, at: '2026-10-29T11:07:00Z' });
    expect(runner().presence?.lastPingAt).toBe(PING_AT);
    expect(s.feed()[0].sub).toBe('No location received · 2:07 PM');
    s.dismissAutoOffline(RUNNER_ID);
    expect(s.autoOffline().has(RUNNER_ID)).toBe(false);
  });

  it('an unknown runner adds a feed row and leaves the runners alone', () => {
    const rows = [runnerFixture()];
    s.runners.set(rows);
    rt.stopped.next({ runnerProfileId: 'not-loaded-runner-9z9z9', lastPingAt: null, at: STOP_AT });
    expect(s.runners()).toBe(rows);
    expect(s.feed()[0]).toMatchObject({ runnerId: 'not-loaded-runner-9z9z9', tone: 'amber' });
  });

  it('ignores an event older than the last one applied for that runner', () => {
    s.runners.set([runnerFixture()]);
    rt.stopped.next({ runnerProfileId: RUNNER_ID, lastPingAt: PING_AT, at: STOP_AT });
    rt.resumed.next({ runnerProfileId: RUNNER_ID, at: PING_AT });
    expect(runner().presence?.webPingsStoppedAt).toBe(STOP_AT);
    expect(s.presenceFeed()).toHaveLength(1);
  });

  it('re-applies an event received during an in-flight refresh', async () => {
    const pending = s.refresh();
    rt.stopped.next({ runnerProfileId: RUNNER_ID, lastPingAt: PING_AT, at: STOP_AT });
    // The server answer predates the event.
    await flushRefresh(http, [runnerFixture()]);
    await pending;
    expect(runner().presence?.webPingsStoppedAt).toBe(STOP_AT);
    expect(s.presenceFeed()).toHaveLength(1);
    // A later refresh is server truth again.
    const next = s.refresh();
    await flushRefresh(http, [runnerFixture()]);
    await next;
    expect(runner().presence?.webPingsStoppedAt).toBeNull();
  });

  it('keeps an auto-offline notice received during a refresh, drops it once the runner is active', async () => {
    const pending = s.refresh();
    rt.offline.next({ runnerProfileId: RUNNER_ID, lastPingAt: PING_AT, at: OFFLINE_AT });
    await flushRefresh(http, [runnerFixture()]);
    await pending;
    expect(runner().availability).toBe('offline');
    expect(s.autoOffline().has(RUNNER_ID)).toBe(true);
    const next = s.refresh();
    await flushRefresh(http, [runnerFixture({ availability: 'online' })]);
    await next;
    expect(s.autoOffline().has(RUNNER_ID)).toBe(false);
  });

  it('refetches once on each reconnect after the first connect', async () => {
    rt.states.next('connecting');
    rt.states.next('connected');
    http.expectNone((r) => r.url === `${API}/runners`);
    expect(s.liveState()).toBe('connected');
    rt.states.next('reconnecting');
    expect(s.liveState()).toBe('reconnecting');
    rt.states.next('connected');
    await flushRefresh(http, [runnerFixture()]);
    http.expectNone((r) => r.url === `${API}/runners`);
    await flushAsync();
  });

  it('keeps at most 5 presence rows, newest first, above the task rows', () => {
    s.errands.set([
      {
        id: 'eeeeeeee-0000-0000-0000-000000010482',
        category: 'buy_for_me',
        status: 'REQUESTED',
        createdAt: '2026-10-29T10:00:00Z',
      } as never,
    ]);
    s.runners.set([runnerFixture()]);
    for (let i = 0; i < 7; i++) {
      const at = `2026-10-29T11:0${i}:00.000Z`;
      if (i % 2 === 0) rt.stopped.next({ runnerProfileId: RUNNER_ID, lastPingAt: null, at });
      else rt.resumed.next({ runnerProfileId: RUNNER_ID, at });
    }
    const feed = s.feed();
    expect(s.presenceFeed()).toHaveLength(5);
    expect(feed.slice(0, 5).map((f) => f.sub.slice(-7))).toEqual([
      '2:06 PM',
      '2:05 PM',
      '2:04 PM',
      '2:03 PM',
      '2:02 PM',
    ]);
    expect(feed[5].errandId).toBe('eeeeeeee-0000-0000-0000-000000010482');
  });

  it('never flags an app runner or an offline runner', () => {
    expect(isFlagged(runnerFixture({}, { client: 'app', webPingsStoppedAt: STOP_AT }))).toBe(false);
    expect(isFlagged(runnerFixture({}, { client: null, webPingsStoppedAt: STOP_AT }))).toBe(false);
    expect(
      isFlagged(runnerFixture({ availability: 'offline' }, { webPingsStoppedAt: STOP_AT })),
    ).toBe(false);
    expect(isFlagged(runnerFixture({}, null))).toBe(false);
  });

  it('detaching stops following the socket', () => {
    const other = new FakeRealtime();
    const detach = s.attachLive(other);
    other.states.next('connected');
    detach();
    expect(s.liveState()).toBe('disconnected');
    s.runners.set([runnerFixture()]);
    other.stopped.next({ runnerProfileId: RUNNER_ID, lastPingAt: null, at: STOP_AT });
    expect(isFlagged(runner())).toBe(false);
  });
});
