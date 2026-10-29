import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LiveMapPanelComponent, liveMapSubLine, mapDotLabel } from './live-map.panel';
import { AdminDataService, lastNDates, lastNWeeks } from '../admin-data.service';
import { setupHttp, timeZoneSwitch } from '../../../testing/admin-test-utils';
import { FakeRealtime } from '../../../testing/fake-realtime';
import {
  OFFLINE_AT,
  PING_AT,
  RUNNER_ID,
  RUNNER_SHORT,
  STOP_AT,
  runnerFixture,
} from '../../../testing/runner-fixtures';
import type { RunnerListItem } from '../../../core/api-types';

describe('live map times (row 96)', () => {
  // Pin a non-EAT browser zone: the sync time must still read EAT.
  const zone = timeZoneSwitch('Europe/London');
  beforeAll(zone.pin);
  afterAll(zone.restore);

  it('shows the sync time in 12-hour East Africa Time', () => {
    // 13:30 UTC = 14:30 in London (BST), 4:30 PM in Nairobi.
    const at = Date.parse('2026-10-08T13:30:00Z');
    expect(new Date(at).getHours()).toBe(14);
    expect(liveMapSubLine(at)).toBe('Nairobi · synced 4:30 PM');
  });

  it('buckets the daily bars by EAT day', () => {
    // 22:30 UTC Sunday 11 Oct = Monday 12 Oct in Nairobi.
    const days = lastNDates(2, Date.parse('2026-10-11T22:30:00Z'));
    expect(days).toEqual([
      { key: '2026-10-11', label: 'S' },
      { key: '2026-10-12', label: 'M' },
    ]);
  });

  it('starts weeks on Monday 00:00 EAT', () => {
    const [week] = lastNWeeks(1, Date.parse('2026-10-14T10:00:00Z'));
    expect(week.start.toISOString()).toBe('2026-10-11T21:00:00.000Z');
    expect(week.end.toISOString()).toBe('2026-10-18T21:00:00.000Z');
  });
});

describe('LiveMapPanelComponent web presence (#36, spec §3.3)', () => {
  const zoneLondon = timeZoneSwitch('Europe/London');
  beforeAll(zoneLondon.pin);
  afterAll(zoneLondon.restore);

  let s: AdminDataService;
  let rt: FakeRealtime;

  beforeEach(() => {
    setupHttp();
    s = TestBed.inject(AdminDataService);
    rt = new FakeRealtime();
    s.attachLive(rt);
  });

  function render(runners: RunnerListItem[]): ComponentFixture<LiveMapPanelComponent> {
    s.runners.set(runners);
    const fixture = TestBed.createComponent(LiveMapPanelComponent);
    fixture.detectChanges();
    return fixture;
  }

  const dots = (f: ComponentFixture<LiveMapPanelComponent>) =>
    [...(f.nativeElement as HTMLElement).querySelectorAll('button.runner-pt')] as HTMLElement[];

  it('labels each dot with id, availability, Web and Pings stopped (aria-label and title)', () => {
    const id = (n: number) => `rrrrrrrr-0000-0000-0000-00000000000${n}`;
    const f = render([
      runnerFixture({ id: id(1) }),
      runnerFixture({ id: id(2), availability: 'busy' }, { webPingsStoppedAt: STOP_AT }),
      runnerFixture({ id: id(3), availability: 'offline' }),
      runnerFixture({ id: id(4), availability: 'busy' }, { client: 'app' }),
      runnerFixture({ id: id(5) }, null),
      runnerFixture({ id: id(6) }, { webPingsStoppedAt: STOP_AT }),
    ]);
    const labels = dots(f).map((d) => d.getAttribute('aria-label'));
    expect(labels).toEqual([
      'Runner #NT-00001 · Online · Web',
      'Runner #NT-00002 · On task · Web · Pings stopped',
      'Runner #NT-00003 · Offline',
      'Runner #NT-00004 · On task',
      'Runner #NT-00005 · Online',
      'Runner #NT-00006 · Online · Web · Pings stopped',
    ]);
    expect(dots(f).map((d) => d.getAttribute('title'))).toEqual(labels);
    expect(dots(f).map((d) => d.className)).toEqual([
      'runner-pt idle',
      'runner-pt busy',
      'runner-pt offline',
      'runner-pt busy',
      'runner-pt idle',
      'runner-pt idle',
    ]);
  });

  it('flips the same dot to offline on an auto-offline event', () => {
    const f = render([runnerFixture({ id: RUNNER_ID }, { webPingsStoppedAt: STOP_AT })]);
    const [before] = dots(f);
    expect(before.className).toBe('runner-pt idle');
    rt.offline.next({ runnerProfileId: RUNNER_ID, lastPingAt: PING_AT, at: OFFLINE_AT });
    f.detectChanges();
    const [after] = dots(f);
    // The marker is updated in place, not re-rendered.
    expect(after).toBe(before);
    expect(after.className).toBe('runner-pt offline');
    expect(after.getAttribute('aria-label')).toBe(`Runner ${RUNNER_SHORT} · Offline`);
  });

  it('renders presence feed rows with their tone, above task rows, opening the runner', () => {
    s.errands.set([
      {
        id: 'eeeeeeee-0000-0000-0000-000000010482',
        category: 'buy_for_me',
        status: 'REQUESTED',
        createdAt: '2026-10-29T10:00:00Z',
      } as never,
    ]);
    const f = render([runnerFixture({ id: RUNNER_ID })]);
    rt.stopped.next({ runnerProfileId: RUNNER_ID, lastPingAt: PING_AT, at: STOP_AT });
    rt.resumed.next({ runnerProfileId: RUNNER_ID, at: OFFLINE_AT });
    f.detectChanges();
    const rows = [...(f.nativeElement as HTMLElement).querySelectorAll('.live-row')];
    const text = (r: Element, sel: string) => r.querySelector(sel)?.textContent?.trim();
    expect(rows.map((r) => text(r, '.t'))).toEqual([
      `Web pings resumed — ${RUNNER_SHORT}`,
      `Web pings stopped — ${RUNNER_SHORT}`,
      expect.stringContaining('#NT-10482'),
    ]);
    expect(text(rows[1], '.s')).toBe('Last ping 2:01 PM · 2:03 PM');
    expect(text(rows[0], '.s')).toBe('2:06 PM');
    const tone = (r: Element) => r.querySelector('.live-dot')?.getAttribute('style');
    expect(tone(rows[0])).toContain('var(--nitume-slate-400)');
    expect(tone(rows[1])).toContain('var(--nitume-amber)');

    const opened: string[] = [];
    f.componentInstance.openRunner.subscribe((id) => opened.push(id));
    (rows[1] as HTMLElement).click();
    expect(opened).toEqual([RUNNER_ID]);
  });

  it('reads "Live updates paused" unless the socket is connected', () => {
    const f = render([]);
    const badge = () =>
      (f.nativeElement as HTMLElement).querySelector('.map-livemode')?.textContent?.trim();
    expect(badge()).toBe('Live updates paused');
    rt.states.next('connecting');
    f.detectChanges();
    expect(badge()).toBe('Live updates paused');
    rt.states.next('connected');
    f.detectChanges();
    expect(badge()).toBe('Live ops feed');
    rt.states.next('reconnecting');
    f.detectChanges();
    expect(badge()).toBe('Live updates paused');
    expect(
      (f.nativeElement as HTMLElement).querySelector('.map-livemode .live-dot'),
    ).not.toBeNull();
  });

  it('keeps the FLAGGED top-stat on disputes', () => {
    const f = render([runnerFixture({}, { webPingsStoppedAt: STOP_AT })]);
    const stats = [...(f.nativeElement as HTMLElement).querySelectorAll('.map-topstat div')];
    const flagged = stats.find((d) => d.textContent?.includes('FLAGGED'));
    expect(flagged?.querySelector('b')?.textContent).toBe('0');
  });

  it('mapDotLabel joins the parts', () => {
    expect(
      mapDotLabel({
        runnerId: RUNNER_ID,
        x: 0,
        y: 0,
        availability: 'busy',
        web: true,
        pingsStopped: false,
      }),
    ).toBe(`Runner ${RUNNER_SHORT} · On task · Web`);
  });
});
