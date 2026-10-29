import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { setupHttp } from '../../../testing/admin-test-utils';
import { FakeRealtime } from '../../../testing/fake-realtime';
import { RUNNER_ID, STOP_AT, runnerFixture } from '../../../testing/runner-fixtures';
import type { RunnerListItem } from '../../../core/api-types';
import { AdminDataService } from '../admin-data.service';
import { RunnersPanelComponent } from './runners.panel';

describe('RunnersPanelComponent web presence (#36, spec §3.1)', () => {
  let http: HttpTestingController;
  let s: AdminDataService;

  beforeEach(() => {
    http = setupHttp();
    s = TestBed.inject(AdminDataService);
  });
  afterEach(() => http.verify());

  function render(runners: RunnerListItem[]): ComponentFixture<RunnersPanelComponent> {
    s.runners.set(runners);
    const fixture = TestBed.createComponent(RunnersPanelComponent);
    fixture.detectChanges();
    return fixture;
  }

  /** Chip texts of each card's `.r-tags` row, with their tone class. */
  function tags(fixture: ComponentFixture<RunnersPanelComponent>): string[][] {
    const el = fixture.nativeElement as HTMLElement;
    return [...el.querySelectorAll('.r-tags')].map((row) =>
      [...row.querySelectorAll('.chip')].map(
        (c) => `${c.textContent?.trim()}|${[...c.classList].find((k) => k.startsWith('chip-'))}`,
      ),
    );
  }

  it('shows Web only for a web runner who is online or busy', () => {
    const fixture = render([
      runnerFixture({ id: 'r-online' }),
      runnerFixture({ id: 'r-busy', availability: 'busy' }),
      runnerFixture({ id: 'r-offline', availability: 'offline' }),
      runnerFixture({ id: 'r-app' }, { client: 'app' }),
      runnerFixture({ id: 'r-none' }, null),
    ]);
    const rows = tags(fixture);
    expect(rows[0][0]).toBe('Web|chip-neutral');
    expect(rows[1][0]).toBe('Web|chip-neutral');
    for (const row of rows.slice(2)) expect(row.some((t) => t.startsWith('Web|'))).toBe(false);
    // Web sits before the level chip.
    expect(rows[0]).toEqual([
      'Web|chip-neutral',
      'Level 2 · ID verified|chip-info',
      '3 skills|chip-neutral',
    ]);
  });

  it('shows Pings stopped (chip-pending) only for a flagged active web runner', () => {
    const fixture = render([
      runnerFixture({ id: 'r-flag' }, { webPingsStoppedAt: STOP_AT }),
      runnerFixture({ id: 'r-busy', availability: 'busy' }, { webPingsStoppedAt: STOP_AT }),
      runnerFixture({ id: 'r-app' }, { client: 'app', webPingsStoppedAt: STOP_AT }),
      runnerFixture({ id: 'r-null' }, { client: null, webPingsStoppedAt: STOP_AT }),
      runnerFixture({ id: 'r-off', availability: 'offline' }, { webPingsStoppedAt: STOP_AT }),
      runnerFixture({ id: 'r-ok' }),
    ]);
    const rows = tags(fixture);
    expect(rows[0].slice(0, 2)).toEqual(['Web|chip-neutral', 'Pings stopped|chip-pending']);
    expect(rows[1].slice(0, 2)).toEqual(['Web|chip-neutral', 'Pings stopped|chip-pending']);
    for (const row of rows.slice(2)) {
      expect(row.some((t) => t.startsWith('Pings stopped'))).toBe(false);
    }
  });

  it('updates the card live on a stopped event, without a refetch', () => {
    const fixture = render([runnerFixture({ id: RUNNER_ID })]);
    const rt = new FakeRealtime();
    s.attachLive(rt);
    expect(tags(fixture)[0]).not.toContain('Pings stopped|chip-pending');
    rt.stopped.next({ runnerProfileId: RUNNER_ID, lastPingAt: null, at: STOP_AT });
    fixture.detectChanges();
    expect(tags(fixture)[0]).toContain('Pings stopped|chip-pending');
    http.expectNone(() => true);
  });
});
