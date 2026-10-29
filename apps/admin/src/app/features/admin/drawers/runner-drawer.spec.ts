import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { setupHttp, timeZoneSwitch } from '../../../testing/admin-test-utils';
import { FakeRealtime } from '../../../testing/fake-realtime';
import { PING_AT, RUNNER_ID, STOP_AT, runnerFixture } from '../../../testing/runner-fixtures';
import type { RunnerListItem } from '../../../core/api-types';
import { AdminDataService } from '../admin-data.service';
import { RunnerDrawerComponent } from './runner-drawer';

describe('RunnerDrawerComponent web presence (#36, spec §3.2)', () => {
  // A non-EAT browser zone: every time must still read East Africa Time.
  const zone = timeZoneSwitch('Europe/London');
  beforeAll(zone.pin);
  afterAll(zone.restore);

  let s: AdminDataService;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 3:00 PM EAT on 29 Oct 2026: the fixture times read "Today, …".
    vi.setSystemTime(new Date('2026-10-29T12:00:00Z'));
    setupHttp();
    s = TestBed.inject(AdminDataService);
  });
  afterEach(() => vi.useRealTimers());

  function render(runner: RunnerListItem): ComponentFixture<RunnerDrawerComponent> {
    s.runners.set([runner]);
    const fixture = TestBed.createComponent(RunnerDrawerComponent);
    fixture.componentRef.setInput('runnerId', runner.id);
    fixture.detectChanges();
    return fixture;
  }

  /** Label → value text of each row of the first card. */
  function rows(fixture: ComponentFixture<RunnerDrawerComponent>): Record<string, string> {
    const card = (fixture.nativeElement as HTMLElement).querySelector('.drawer-card')!;
    return Object.fromEntries(
      [...card.querySelectorAll('.drawer-row')].map((row) => [
        row.querySelector('span')?.textContent?.trim(),
        (row.textContent ?? '').replace(row.querySelector('span')?.textContent ?? '', '').trim(),
      ]),
    );
  }

  function labels(fixture: ComponentFixture<RunnerDrawerComponent>): string[] {
    const card = (fixture.nativeElement as HTMLElement).querySelector('.drawer-card')!;
    return [...card.querySelectorAll('.drawer-row > span:first-child')].map(
      (sp) => sp.textContent?.trim() ?? '',
    );
  }

  it('shows the Client row as Web, App or —, right after Availability', () => {
    expect(rows(render(runnerFixture()))['Client']).toBe('Web');
    expect(rows(render(runnerFixture({}, { client: 'app' })))['Client']).toBe('App');
    expect(rows(render(runnerFixture({}, { client: null })))['Client']).toBe('—');
    const f = render(runnerFixture({}, null));
    expect(rows(f)['Client']).toBe('—');
    const l = labels(f);
    expect(l.slice(l.indexOf('Availability'), l.indexOf('Availability') + 3)).toEqual([
      'Availability',
      'Client',
      'Last ping',
    ]);
  });

  it('formats Last ping in EAT, from presence first and the profile second', () => {
    const presence = render(runnerFixture({ lastPingAt: '2026-10-29T09:00:00Z' }));
    expect(rows(presence)['Last ping']).toBe('Today, 2:01 PM');
    // The value is a Fira Code `b`.
    const card = presence.nativeElement.querySelector('.drawer-card') as HTMLElement;
    const lastPing = [...card.querySelectorAll('.drawer-row')].find((r) =>
      r.textContent?.includes('Last ping'),
    )!;
    expect(lastPing.querySelector('b')?.textContent).toBe('Today, 2:01 PM');
    const profile = render(
      runnerFixture({ lastPingAt: '2026-10-29T09:00:00Z' }, { lastPingAt: null }),
    );
    expect(rows(profile)['Last ping']).toBe('Today, 12:00 PM');
    expect(rows(render(runnerFixture({}, null)))['Last ping']).toBe('—');
  });

  it('shows Location pings and Flagged only while flagged', () => {
    const flagged = render(runnerFixture({ availability: 'busy' }, { webPingsStoppedAt: STOP_AT }));
    const r = rows(flagged);
    expect(r['Location pings']).toBe('Pings stopped');
    expect(
      flagged.nativeElement.querySelector('.drawer-card .chip-pending')?.textContent?.trim(),
    ).toBe('Pings stopped');
    expect(r['Flagged']).toBe('Today, 2:03 PM');
    expect(labels(flagged).slice(1, 6)).toEqual([
      'Availability',
      'Client',
      'Location pings',
      'Flagged',
      'Last ping',
    ]);
    for (const runner of [
      runnerFixture(),
      runnerFixture({ availability: 'offline' }, { webPingsStoppedAt: STOP_AT }),
    ]) {
      const l = labels(render(runner));
      expect(l).not.toContain('Location pings');
      expect(l).not.toContain('Flagged');
    }
  });

  it('never flags an app runner, even with a stray webPingsStoppedAt', () => {
    const f = render(runnerFixture({}, { client: 'app', webPingsStoppedAt: STOP_AT }));
    expect(labels(f)).not.toContain('Location pings');
    expect(labels(f)).not.toContain('Flagged');
    expect(f.nativeElement.querySelector('.chip-pending')).toBeNull();
    expect(rows(f)['Client']).toBe('App');
  });

  it('updates the rows live when a stopped event arrives', () => {
    const f = render(runnerFixture({ id: RUNNER_ID }));
    expect(labels(f)).not.toContain('Flagged');
    const rt = new FakeRealtime();
    s.attachLive(rt);
    rt.stopped.next({ runnerProfileId: RUNNER_ID, lastPingAt: PING_AT, at: STOP_AT });
    f.detectChanges();
    expect(rows(f)['Flagged']).toBe('Today, 2:03 PM');
  });
});
