import { TestBed } from '@angular/core/testing';
import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { API, flushAsync, httpError, setupHttp } from '../../../testing/admin-test-utils';
import {
  AREAS_URL,
  PROFILE,
  PROFILE_2,
  RUNNER,
  USER,
  check,
  isDocument,
  isQueue,
  ownersChecks,
  page,
  runner,
} from '../../../testing/verification-fixtures';
import {
  SEARCH_DEBOUNCE_MS,
  VerificationsPanelComponent,
  searchQuery,
} from './verifications.panel';
import { AdminDataService } from '../admin-data.service';
import { DrawerNavService } from '../drawer-nav.service';
import type { VerificationQueueItem, VerificationQueueResult } from '../../../core/api-types';

const AREAS = [
  { id: 'kilimani', name: 'Kilimani' },
  { id: 'westlands', name: 'Westlands' },
];

describe('searchQuery', () => {
  it('sends 2–64 trimmed characters, else nothing', () => {
    expect(searchQuery('')).toBe('');
    expect(searchQuery('  m ')).toBe('');
    expect(searchQuery('  me ')).toBe('me');
    expect(searchQuery('x'.repeat(70))).toBe('x'.repeat(64));
  });
});

describe('VerificationsPanelComponent (table)', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    http = setupHttp();
  });
  afterEach(() => {
    // The table never asks for an image link (row 278 security rule).
    http.expectNone(isDocument);
    http.verify();
  });

  async function render(
    items: VerificationQueueItem[] = [runner(ownersChecks())],
    patch: Partial<VerificationQueueResult> = {},
    areas: 'ok' | 'fail' = 'ok',
  ) {
    const fixture = TestBed.createComponent(VerificationsPanelComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Loading…');
    expect(el.textContent).not.toContain('No applications');
    const req = http.expectOne(isQueue);
    expect(req.request.params.get('status')).toBe('pending');
    expect(req.request.params.get('limit')).toBe('20');
    for (const k of ['serviceAreaId', 'level', 'q', 'cursor']) {
      expect(req.request.params.has(k)).toBe(false);
    }
    req.flush(page(items, patch));
    const a = http.expectOne(AREAS_URL);
    if (areas === 'ok') a.flush({ items: AREAS });
    else a.flush(null, httpError(500));
    await settle(fixture);
    return { fixture, el };
  }

  async function settle(fixture: { detectChanges(): void }) {
    await flushAsync();
    fixture.detectChanges();
  }

  function button(root: HTMLElement, text: string): HTMLButtonElement {
    const found = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent?.trim() === text,
    );
    if (!found) throw new Error(`no button ${text}`);
    return found;
  }

  function select(el: HTMLElement, label: string): HTMLSelectElement {
    const s = el.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);
    if (!s) throw new Error(`no select ${label}`);
    return s;
  }

  function choose(fixture: { detectChanges(): void }, s: HTMLSelectElement, value: string) {
    s.value = value;
    s.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  const rows = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLElement>('tbody tr'));
  const cells = (tr: HTMLElement) =>
    Array.from(tr.querySelectorAll<HTMLElement>('td')).map((td) =>
      td.textContent?.replace(/\s+/g, ' ').trim(),
    );
  const caption = (el: HTMLElement) =>
    el.querySelector('.panel-caption')?.textContent?.replace(/\s+/g, ' ').trim();

  it('renders one row per runner with the specced columns and fonts', async () => {
    const { el } = await render();
    expect(el.querySelector('h1')?.textContent).toBe('Runner verification');
    expect(el.querySelector('.ops-topbar .sub')?.textContent).toBe('1 application awaiting review');
    expect(el.querySelector('.verif-card')).toBeNull();
    expect(el.querySelector('.table-card.verif-table')).toBeTruthy();
    expect(Array.from(el.querySelectorAll('th')).map((t) => t.textContent?.trim())).toEqual([
      'Runner',
      'Phone',
      'Service area',
      'Level',
      'Checks',
      'Waiting since',
      'Applied',
      'Status',
      'Action',
    ]);
    expect(el.querySelectorAll('th[scope="col"]').length).toBe(9);
    expect(el.querySelector('th .sr-only')?.textContent).toBe('Action');
    expect(rows(el).length).toBe(1);

    const tr = rows(el)[0];
    const [name, phone, area, level, checks, waiting, applied, status, action] = cells(tr);
    expect(name).toBe('Mercy W. #NT-C0CA7');
    expect(tr.querySelector('.task-cat')?.classList.contains('num')).toBe(false);
    expect(tr.querySelector('.task-id')?.textContent).toBe('#NT-C0CA7');
    expect(phone).toBe('+254 712 345 678');
    expect(area).toBe('Kilimani +1');
    expect(level).toBe('Level 1 · Basic');
    // Owner's runner: four pending, nothing rejected, nothing missing.
    expect(checks).toBe('4 pending');
    expect(waiting).toContain('10:30 AM');
    expect(applied).toMatch(/\d{1,2}:\d{2} [AP]M/);
    expect(status).toBe('Pending');
    expect(action).toBe('View documents');

    const td = tr.querySelectorAll('td');
    expect(td[1].classList.contains('num')).toBe(true);
    expect(Array.from(td[2].querySelectorAll('.num')).map((n) => n.textContent)).toEqual(['+1']);
    expect(Array.from(td[4].querySelectorAll('.num')).map((n) => n.textContent)).toEqual(['4']);
    expect(td[5].classList.contains('num')).toBe(true);
    expect(td[6].classList.contains('num')).toBe(true);
    expect(td[2].classList.contains('col-area')).toBe(true);
    expect(td[6].classList.contains('col-applied')).toBe(true);
    expect(td[3].querySelector('app-status-chip')).toBeTruthy();
    expect(td[7].querySelector('.chip-pending')).toBeTruthy();
    expect(button(tr, 'View documents').getAttribute('aria-label')).toBe(
      'View documents for Mercy W.',
    );
    expect(button(tr, 'View documents').className).toBe('row-assign');

    // No image, thumbnail or link in the table.
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('a[href]')).toBeNull();
    expect(el.textContent?.replace(/\s+/g, ' ')).toContain(
      "Opening a runner's documents shows their ID and selfie images; each image shown is logged. Images are deleted at the end of the retention period. A runner reaches Level 2 when both ID sides and the selfie are approved, and drops back to Level 1 while any of them is rejected or replaced.",
    );
    expect(caption(el)).toBe('Showing 1 of 1');
    expect(
      Array.from(el.querySelectorAll('.panel-caption .num')).map((n) => n.textContent),
    ).toEqual(['1', '1']);
    expect(el.textContent).not.toContain('NaN');
  });

  it('shows the short id in Fira Code and dashes when name, phone, area, level or waiting are missing', async () => {
    const approved = ownersChecks().map((c) => ({ ...c, status: 'approved' as const }));
    const { el } = await render([
      runner(approved, {
        user: { id: USER, phone: null, displayName: null, shortName: null },
        runnerProfile: { ...RUNNER, serviceAreas: [], verificationLevel: '' },
      }),
    ]);
    const tr = rows(el)[0];
    expect(tr.querySelector('.task-cat')?.textContent?.trim()).toBe('#NT-C0CA7');
    expect(tr.querySelector('.task-cat')?.classList.contains('num')).toBe(true);
    expect(tr.querySelector('.task-id')).toBeNull();
    const [, phone, area, level, checks, waiting, , status] = cells(tr);
    expect([phone, area, level, waiting]).toEqual(['—', '—', '—', '—']);
    expect(checks).toBe('All verified');
    expect(status).toBe('Approved');
    expect(button(tr, 'View documents').getAttribute('aria-label')).toBe(
      'View documents for #NT-C0CA7',
    );
  });

  it('summarises checks on the newest record per (type, side) and derives the status chip', async () => {
    const mixed = runner([
      // Superseded pending front (row 271) never counts.
      check('front-old', { side: 'front', createdAt: '2026-10-18T07:00:00Z' }),
      check('front-new', { side: 'front', status: 'rejected', createdAt: '2026-10-21T07:00:00Z' }),
      check('selfie', { verificationType: 'selfie', status: 'approved' }),
    ]);
    const second = runner(
      [check('w-front', { runnerProfileId: PROFILE_2, side: 'front', status: 'pending' })],
      { runnerProfile: { ...RUNNER, id: PROFILE_2 } },
    );
    const { el } = await render([mixed, second]);
    const [a, b] = rows(el).map(cells);
    // Missing: phone, ID back, payment identity.
    expect(a[4]).toBe('1 rejected · 3 not submitted');
    expect(a[7]).toBe('Rejected');
    expect(rows(el)[0].querySelector('td:nth-child(8) .chip-danger')).toBeTruthy();
    expect(b[4]).toBe('1 pending · 4 not submitted');
    expect(b[7]).toBe('Pending');
  });

  it('prefers the API applicationStatus (AV-5) for the chip', async () => {
    const { el } = await render([runner(ownersChecks(), { applicationStatus: 'rejected' })]);
    expect(cells(rows(el)[0])[7]).toBe('Rejected');
  });

  it('opens the documents drawer from View documents and from the row', async () => {
    const { el } = await render();
    const nav = TestBed.inject(DrawerNavService);
    button(rows(el)[0], 'View documents').click();
    expect(nav.current()).toEqual({ kind: 'runner_verification', id: PROFILE });
    nav.current.set(null);
    rows(el)[0].querySelector<HTMLElement>('td')!.click();
    expect(nav.current()).toEqual({ kind: 'runner_verification', id: PROFILE });
  });

  it('updates the row in place on a drawer decision, and reloads once when the drawer closes', async () => {
    const { fixture, el } = await render();
    const s = TestBed.inject(AdminDataService);
    const nav = TestBed.inject(DrawerNavService);
    nav.open('runner_verification', PROFILE);
    fixture.detectChanges();
    // The drawer's approve goes through the store.
    void s.reviewVerification(check('v-selfie', { verificationType: 'selfie' }), 'approved');
    http
      .expectOne(`${API}/runners/${PROFILE}/verifications/v-selfie`)
      .flush(check('v-selfie', { verificationType: 'selfie', status: 'approved' }));
    await settle(fixture);
    expect(cells(rows(el)[0])[4]).toBe('3 pending');
    http.expectNone(isQueue);

    nav.requestClose();
    await settle(fixture);
    const req = http.expectOne(isQueue);
    expect(req.request.params.get('status')).toBe('pending');
    req.flush(page([runner(ownersChecks())]));
    await settle(fixture);

    // Closing again without a save does not reload.
    nav.open('runner_verification', PROFILE);
    await settle(fixture);
    nav.requestClose();
    await settle(fixture);
    http.expectNone(isQueue);
  });

  describe('filters', () => {
    it('lists areas from the API, levels with chip labels, and statuses as built', async () => {
      const { el } = await render();
      const area = select(el, 'Filter by service area');
      expect(Array.from(area.options).map((o) => [o.value, o.textContent?.trim()])).toEqual([
        ['', 'All areas'],
        ['kilimani', 'Kilimani'],
        ['westlands', 'Westlands'],
      ]);
      expect(area.disabled).toBe(false);
      const level = select(el, 'Filter by level');
      expect(Array.from(level.options).map((o) => o.textContent?.trim())).toEqual([
        'All levels',
        'Level 1 · Basic',
        'Level 2 · ID verified',
        'Level 3 · Trusted',
        'Level 4 · Professional',
      ]);
      expect(Array.from(select(el, 'Filter by status').options).map((o) => o.value)).toEqual([
        'all',
        'pending',
        'approved',
        'rejected',
      ]);
      const search = el.querySelector<HTMLInputElement>('input[type="search"]')!;
      expect(search.placeholder).toBe('Search name, phone or ID');
      expect(search.getAttribute('aria-label')).toBe('Search runners');
      expect(search.getAttribute('maxlength')).toBe('64');
    });

    it('keeps only All areas, disabled, when the area list fails', async () => {
      const { el } = await render(undefined, {}, 'fail');
      const area = select(el, 'Filter by service area');
      expect(area.options.length).toBe(1);
      expect(area.disabled).toBe(true);
      expect(el.querySelector('.panel-notice')).toBeNull();
      expect(rows(el).length).toBe(1);
    });

    it('sends each filter, combined, and clears the rows and cursor on every change', async () => {
      const { fixture, el } = await render([runner(ownersChecks())], { nextCursor: 'c1' });

      choose(fixture, select(el, 'Filter by service area'), 'westlands');
      expect(rows(el).length).toBe(0);
      expect(el.querySelector('app-load-more')).toBeNull();
      let req: TestRequest = http.expectOne(isQueue);
      expect(req.request.params.get('serviceAreaId')).toBe('westlands');
      expect(req.request.params.has('cursor')).toBe(false);
      req.flush(page([runner(ownersChecks())], { nextCursor: 'c2' }));
      await settle(fixture);

      choose(fixture, select(el, 'Filter by level'), '2_id_verified');
      expect(rows(el).length).toBe(0);
      req = http.expectOne(isQueue);
      expect(req.request.params.get('level')).toBe('2_id_verified');
      expect(req.request.params.get('serviceAreaId')).toBe('westlands');
      expect(req.request.params.has('cursor')).toBe(false);
      req.flush(page([]));
      await settle(fixture);

      choose(fixture, select(el, 'Filter by status'), 'rejected');
      req = http.expectOne(isQueue);
      expect(req.request.params.get('status')).toBe('rejected');
      expect(req.request.params.get('level')).toBe('2_id_verified');
      req.flush(page([]));
      await settle(fixture);
      expect(el.textContent).toContain('No applications match');
      expect(el.textContent).toContain('Clear the filters, or wait for runner submissions.');

      choose(fixture, select(el, 'Filter by level'), '');
      req = http.expectOne(isQueue);
      expect(req.request.params.has('level')).toBe(false);
      req.flush(page([]));
      await settle(fixture);
    });

    it('debounces the search 300 ms and sends only 2–64 trimmed characters', async () => {
      const { fixture, el } = await render();
      const input = el.querySelector<HTMLInputElement>('input[type="search"]')!;
      const type = (v: string) => {
        input.value = v;
        input.dispatchEvent(new Event('input'));
        fixture.detectChanges();
      };
      const wait = () => new Promise((r) => setTimeout(r, SEARCH_DEBOUNCE_MS + 20));

      type('m');
      await wait();
      http.expectNone(isQueue);

      type('me');
      type(' mercy ');
      await new Promise((r) => setTimeout(r, 100));
      http.expectNone(isQueue);
      await wait();
      const req = http.expectOne(isQueue);
      expect(req.request.params.get('q')).toBe('mercy');
      expect(req.request.params.has('cursor')).toBe(false);
      req.flush(page([]));
      await settle(fixture);
      expect(el.textContent).toContain('No applications match');

      // Clearing the search sends no `q` and is the default view again.
      type('');
      await wait();
      const back = http.expectOne(isQueue);
      expect(back.request.params.has('q')).toBe(false);
      back.flush(page([]));
      await settle(fixture);
      expect(el.textContent).toContain('No applications awaiting review');
      expect(el.textContent).toContain('New runner submissions land here.');
    });

    it('reloads page 1 silently when Load more answers cursor_invalid', async () => {
      const { fixture, el } = await render([runner(ownersChecks())], { nextCursor: 'c1' });
      button(el, 'Load more').click();
      http.expectOne(isQueue).flush({ code: 'cursor_invalid' }, httpError(400));
      await flushAsync();
      const req = http.expectOne(isQueue);
      expect(req.request.params.has('cursor')).toBe(false);
      req.flush(page([runner(ownersChecks())]));
      await settle(fixture);
      expect(el.querySelector('.panel-notice')).toBeNull();
      expect(rows(el).length).toBe(1);
    });
  });

  it('shows the default empty state with no caption', async () => {
    const { el } = await render([], { awaitingReviewCount: 0 });
    expect(el.textContent).toContain('No applications awaiting review');
    expect(el.textContent).toContain('New runner submissions land here.');
    expect(el.querySelector('.panel-caption')).toBeNull();
    expect(el.querySelector('table')).toBeNull();
  });

  it('clears the rows when a load fails, without an empty state, and recovers on refresh', async () => {
    const { fixture, el } = await render();
    choose(fixture, select(el, 'Filter by status'), 'approved');
    expect(rows(el).length).toBe(0);
    http.expectOne(isQueue).flush(null, httpError(500));
    await settle(fixture);
    expect(el.textContent).toContain("Couldn't load verifications. Try again.");
    expect(rows(el).length).toBe(0);
    expect(el.textContent).not.toContain('No applications');
    expect(el.querySelector('app-load-more')).toBeNull();

    button(el, '↻ Refresh').click();
    fixture.detectChanges();
    expect(el.textContent).not.toContain("Couldn't load verifications. Try again.");
    http.expectOne(isQueue).flush(page([], { awaitingReviewCount: 0 }));
    await settle(fixture);
    expect(el.querySelector('.panel-notice')).toBeNull();
    expect(el.textContent).toContain('No applications match');
    expect(el.querySelector('.ops-topbar .sub')?.textContent).toBe(
      'No applications awaiting review',
    );
  });

  it('merges a runner returning on a later page into its row, and keeps rows when Load more fails', async () => {
    const other = runner(
      [
        check('w-front', {
          runnerProfileId: PROFILE_2,
          side: 'front',
          runnerProfile: { ...RUNNER, id: PROFILE_2 },
        }),
      ],
      {
        runnerProfile: { ...RUNNER, id: PROFILE_2 },
        user: { id: 'u2', phone: null, displayName: 'Dennis Kamau', shortName: 'Dennis K.' },
      },
    );
    const { fixture, el } = await render([runner(ownersChecks().slice(0, 2))], {
      nextCursor: 'c1',
      total: 2,
    });
    expect(caption(el)).toBe('Showing 1 of 2');
    button(el, 'Load more').click();
    const req = http.expectOne(isQueue);
    expect(req.request.params.get('cursor')).toBe('c1');
    // The API's summary always covers every record of the runner.
    const rest = runner(ownersChecks().slice(2), {
      verification: runner(ownersChecks()).verification,
    });
    req.flush(page([rest, other], { nextCursor: 'c2', total: 2 }));
    await settle(fixture);
    expect(rows(el).length).toBe(2);
    expect(cells(rows(el)[0])[4]).toBe('4 pending');
    expect(caption(el)).toBe('Showing 2 of 2');

    button(el, 'Load more').click();
    http.expectOne(isQueue).flush(null, httpError(500));
    await settle(fixture);
    expect(rows(el).length).toBe(2);
    expect(el.textContent).toContain("Couldn't load verifications. Try again.");
    expect(button(el, 'Load more')).toBeTruthy();

    button(el, 'Load more').click();
    http.expectOne(isQueue).flush(page([], { nextCursor: null, total: 2 }));
    await settle(fixture);
    expect(el.textContent).not.toContain("Couldn't load verifications. Try again.");
  });
});
