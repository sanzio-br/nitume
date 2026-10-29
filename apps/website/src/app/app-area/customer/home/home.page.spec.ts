// customer-v-home.md, Required tests H T1–T19 (G7-29; bell G7-20, avatar
// G7-21, search G7-22, card G7-23, rows G7-24).
import { DestroyRef, Provider, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject } from 'rxjs';
import { AppHarness, text } from '../../../../testing/app-harness';
import { API, expectRequest, httpMock, userJson } from '../../../../testing/auth';
import { accessibleText, declared, noShadow } from '../../../../testing/css';
import { errand, openCustomer } from '../../../../testing/customer';
import { SessionStore } from '../../../core/auth/session.store';
import { ErrandStatusChanged, RealtimeConnectionState } from '../../../core/realtime/realtime.events';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { formatDayTime } from '../../../shared/format/formatters';
import { CUSTOMER_NOW } from '../clock';
import { ErrandView } from '../data/errands.api';
import { HOME_POLL_MS } from './home.page';

const ACTIVE_URL = `${API}/errands?status=REQUESTED,QUOTED,ACCEPTED,PAYMENT_CONFIRMED,RUNNER_ASSIGNED,RUNNER_EN_ROUTE,ARRIVED,IN_PROGRESS,AWAITING_CUSTOMER&limit=5`;
const RECENT_URL = `${API}/errands?status=COMPLETED,CONFIRMED,SETTLED,CANCELLED,FAILED,EXPIRED,DISPUTED&limit=2`;
const UNREAD_URL = `${API}/notifications/unread-count`;
const NOW = new Date(2026, 9, 29, 10, 0);

class FakeRealtime {
  readonly state = signal<RealtimeConnectionState>('connected');
  readonly statusChanges$ = new Subject<ErrandStatusChanged>();
  locationSubscriptions = 0;
  readonly locationUpdates$ = new Observable(() => {
    this.locationSubscriptions++;
  });
  readonly listeners = new Set<(s: RealtimeConnectionState) => void>();
  readonly joinErrand = vi.fn(async (_id: string) => true);
  readonly leaveErrand = vi.fn((_id: string) => undefined);
  readonly connect = vi.fn(async () => undefined);
  readonly disconnect = vi.fn();
  onStateChange(listener: (s: RealtimeConnectionState) => void, destroyRef: DestroyRef): () => void {
    this.listeners.add(listener);
    destroyRef.onDestroy(() => this.listeners.delete(listener));
    return () => this.listeners.delete(listener);
  }
  showReconnecting() {
    return signal(false).asReadonly();
  }
  set(state: RealtimeConnectionState): void {
    this.state.set(state);
    for (const l of this.listeners) l(state);
  }
}

interface HomeOptions {
  active?: ErrandView[] | 'fail' | 'network';
  recent?: ErrandView[] | 'fail';
  unread?: number | 'fail';
  name?: string;
  now?: Date;
  realtime?: FakeRealtime;
  width?: number;
  providers?: Provider[];
  answer?: boolean;
}

async function answerHome(opts: HomeOptions = {}): Promise<void> {
  const active = await expectRequest(ACTIVE_URL);
  const recent = await expectRequest(RECENT_URL);
  const unread = await expectRequest(UNREAD_URL);
  if (opts.unread === 'fail') unread.flush({ message: 'x' }, { status: 500, statusText: 'Error' });
  else unread.flush({ unread: opts.unread ?? 0 });
  if (opts.active === 'fail') active.flush({ message: 'x' }, { status: 500, statusText: 'Error' });
  else if (opts.active === 'network') active.error(new ProgressEvent('error'), { status: 0 });
  else active.flush({ items: opts.active ?? [], nextCursor: null });
  if (opts.recent === 'fail') recent.flush({ message: 'x' }, { status: 500, statusText: 'Error' });
  else recent.flush({ items: opts.recent ?? [], nextCursor: null });
}

async function openHome(opts: HomeOptions = {}): Promise<AppHarness> {
  const now = opts.now ?? NOW;
  const providers: Provider[] = [{ provide: CUSTOMER_NOW, useValue: () => now }, ...(opts.providers ?? [])];
  if (opts.realtime) providers.push({ provide: RealtimeService, useValue: opts.realtime });
  const h = await openCustomer('/app/customer/home', {
    restore: userJson({ role: 'customer', displayName: opts.name ?? 'Achieng Wanjiru' }),
    providers,
    width: opts.width,
  });
  if (opts.answer !== false) {
    await answerHome(opts);
    await h.detect();
  }
  return h;
}

const page = (h: AppHarness) => h.root().querySelector('app-home-page') as HTMLElement;
const sectionLabels = (h: AppHarness) => Array.from(page(h).querySelectorAll('nm-section-label h2')).map((e) => text(e));
const card = (h: AppHarness) => page(h).querySelector('nm-active-task-card') as HTMLElement | null;
const rows = (h: AppHarness) => Array.from(page(h).querySelectorAll<HTMLAnchorElement>('nm-task-row a'));

describe('customer v-home (#7)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('H T1. greeting by the injected clock; first name as the title; no name → greeting only and a visually hidden h1 Home', async () => {
    const cases: [Date, string][] = [
      [new Date(2026, 9, 29, 11, 59), 'Good morning'],
      [new Date(2026, 9, 29, 12, 0), 'Good afternoon'],
      [new Date(2026, 9, 29, 17, 59), 'Good afternoon'],
      [new Date(2026, 9, 29, 18, 0), 'Good evening'],
    ];
    for (const [now, greeting] of cases) {
      const h = await openHome({ now });
      expect.soft(text(page(h).querySelector('.nm-top-bar__greeting')), greeting).toBe(greeting);
    }
    let h = await openHome({ name: 'Achieng Wanjiru' });
    expect(text(page(h).querySelector('nm-top-bar h1'))).toBe('Achieng');
    expect(page(h).querySelector('.home__hidden-heading')).toBeNull();

    h = await openHome();
    const session = TestBed.inject(SessionStore) as unknown as { userSignal: { update: (fn: (u: unknown) => unknown) => void } };
    session.userSignal.update((u) => ({ ...(u as object), displayName: null }));
    await h.detect();
    expect(page(h).querySelector('nm-top-bar h1')).toBeNull();
    expect(text(page(h).querySelector('.nm-top-bar__greeting'))).toBe('Good morning');
    const hidden = page(h).querySelector('h1.home__hidden-heading') as HTMLElement;
    expect(text(hidden)).toBe('Home');
    expect(declared('.home__hidden-heading', 'clip-path')).toEqual(['inset(50%)']);
    expect(page(h).querySelector('nm-avatar nm-icon')?.getAttribute('data-icon')).toBe('person');
  });

  it('H T2. avatar: initials AW, the person icon without a name, links to the profile, name Profile, blue fill with white text', async () => {
    const h = await openHome();
    const link = page(h).querySelector('nm-avatar a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/app/customer/profile');
    expect(link.getAttribute('aria-label')).toBe('Profile');
    expect(text(link.querySelector('.nm-avatar__initials'))).toBe('AW');
    expect(declared('.nm-avatar', 'background-color')).toEqual(['var(--nitume-blue)']);
    expect(declared('.nm-avatar__initials', 'color')).toEqual(['var(--nitume-white)']);
  });

  it('H T3. bell: unread 3 → red dot and Notifications, 3 unread; 0 → no dot; a failed count → no dot and no error; links to notifications', async () => {
    let h = await openHome({ unread: 3 });
    let bell = page(h).querySelector('nm-notification-bell a') as HTMLAnchorElement;
    expect(bell.getAttribute('aria-label')).toBe('Notifications, 3 unread');
    expect(bell.getAttribute('href')).toBe('/app/customer/notifications');
    expect(bell.querySelector('.nm-bell__dot')).not.toBeNull();
    expect(declared('.nm-bell__dot', 'background-color')).toEqual(['var(--nitume-red)']);
    h = await openHome({ unread: 0 });
    bell = page(h).querySelector('nm-notification-bell a') as HTMLAnchorElement;
    expect(bell.getAttribute('aria-label')).toBe('Notifications');
    expect(bell.querySelector('.nm-bell__dot')).toBeNull();
    h = await openHome({ unread: 'fail' });
    bell = page(h).querySelector('nm-notification-bell a') as HTMLAnchorElement;
    expect(bell.querySelector('.nm-bell__dot')).toBeNull();
    expect(page(h).querySelector('[role="alert"]')).toBeNull();
  });

  it('H T4. search row: What do you need done?, a link to /app/customer/new without a query, slate-400 text', async () => {
    const h = await openHome();
    const search = page(h).querySelector('nm-search-entry a') as HTMLAnchorElement;
    expect(text(search)).toBe('What do you need done?');
    expect(search.getAttribute('href')).toBe('/app/customer/new');
    expect(getComputedStyle(search.querySelector('.nm-search-entry__text') as HTMLElement).color).toBe('var(--nitume-slate-400)');
  });

  it('H T5. categories: five tiles in order with exact names, no Business Tasks, no sixth cell, each a link with ?category=<wire>', async () => {
    const h = await openHome();
    const tiles = Array.from(page(h).querySelectorAll<HTMLAnchorElement>('nm-category-grid a'));
    expect(tiles.map((t) => text(t))).toEqual(['Buy For Me', 'Get It For Me', 'Check It For Me', 'Go There For Me', 'Wait For Me']);
    expect(tiles.map((t) => t.getAttribute('href'))).toEqual([
      '/app/customer/new?category=buy_for_me',
      '/app/customer/new?category=pickup_delivery',
      '/app/customer/new?category=inspection',
      '/app/customer/new?category=representation',
      '/app/customer/new?category=queue_admin',
    ]);
    expect(page(h).querySelector('.nm-category-grid')?.children).toHaveLength(5);
    expect(page(h).textContent).not.toContain('Business Tasks');
  });

  it('H T6. requests: exactly the two list calls with their status lists and limits, plus the unread count; nothing else', async () => {
    await openHome();
    httpMock().verify();
  });

  it('H T7. loading: a 140px and two 72px skeletons, no In progress / Recent labels, category links usable', async () => {
    const h = await openHome({ answer: false });
    const skeletons = Array.from(page(h).querySelectorAll('.home__tasks nm-skeleton-card [role="status"]')) as HTMLElement[];
    expect(skeletons.map((s) => s.style.height)).toEqual(['140px', '72px', '72px']);
    expect(skeletons.every((s) => s.getAttribute('aria-label') === 'Loading')).toBe(true);
    expect(sectionLabels(h)).toEqual(['Categories']);
    expect(page(h).querySelectorAll('nm-category-grid a')).toHaveLength(5);
    expect(page(h).querySelector('nm-search-entry a')).not.toBeNull();
  });

  it('H T8. empty: no In progress, no Recent, no error and no empty message; categories and search still render', async () => {
    const h = await openHome({ active: [], recent: [] });
    expect(sectionLabels(h)).toEqual(['Categories']);
    expect(card(h)).toBeNull();
    expect(rows(h)).toEqual([]);
    expect(page(h).querySelector('nm-error-state, nm-empty-state, [role="alert"]')).toBeNull();
    expect(text(page(h).querySelector('.home__tasks'))).toBe('');
    expect(page(h).querySelectorAll('nm-category-grid a')).toHaveLength(5);
    expect(page(h).querySelector('nm-search-entry a')).not.toBeNull();
  });

  it("H T9. active 500, recent 500 and a network error each show Couldn't load your tasks. + Try again, which retries both calls", async () => {
    for (const opts of [{ active: 'fail' }, { recent: 'fail' }, { active: 'network' }] as HomeOptions[]) {
      const h = await openHome(opts);
      expect.soft(text(page(h).querySelector('nm-error-state [role="alert"]'))).toBe("Couldn't load your tasks.");
      const retry = page(h).querySelector('nm-error-state button') as HTMLButtonElement;
      expect.soft(text(retry)).toBe('Try again');
      retry.click();
      await answerHome({ active: [errand({ id: 'e-1' })] });
      await h.detect();
      expect.soft(page(h).querySelector('nm-error-state')).toBeNull();
      expect.soft(card(h)).not.toBeNull();
    }
  });

  it('H T10. active card per state: meta, button and href; RUNNER_ASSIGNED never names the runner; no shortName → Your runner; never an ETA', async () => {
    const runner = { runner: { shortName: 'Brian K.' } };
    const table: [string, ErrandView['assignment'], string, string, string][] = [
      ['REQUESTED', null, 'Waiting for your quote', 'View request →', '/app/customer/tasks/e-1/quote'],
      ['QUOTED', null, 'Your quote is ready', 'Review quote →', '/app/customer/tasks/e-1/quote'],
      ['ACCEPTED', null, 'Pay to confirm your task', 'Pay now →', '/app/customer/tasks/e-1/payment'],
      ['PAYMENT_CONFIRMED', null, 'Finding a runner', 'Track live →', '/app/customer/track/e-1'],
      ['RUNNER_ASSIGNED', runner, 'Finding a runner', 'Track live →', '/app/customer/track/e-1'],
      ['RUNNER_EN_ROUTE', runner, 'Brian K. is en route', 'Track live →', '/app/customer/track/e-1'],
      ['RUNNER_EN_ROUTE', { runner: { shortName: null } }, 'Your runner is en route', 'Track live →', '/app/customer/track/e-1'],
      ['ARRIVED', runner, 'Brian K. has arrived', 'Track live →', '/app/customer/track/e-1'],
      ['IN_PROGRESS', runner, 'Brian K. is on it', 'Track live →', '/app/customer/track/e-1'],
      ['AWAITING_CUSTOMER', runner, 'Ready for your review', 'Review evidence →', '/app/customer/tasks/e-1/evidence'],
    ];
    for (const [status, assignment, meta, label, href] of table) {
      const h = await openHome({ active: [errand({ id: 'e-1', status, assignment })] });
      const c = card(h) as HTMLElement;
      const metaText = text(c.querySelector('.nm-active-task-card__meta'));
      expect.soft(metaText, status).toBe(meta);
      expect.soft(metaText, status).not.toMatch(/ETA|\d+\s*min/);
      const action = c.querySelector('a.nm-btn') as HTMLAnchorElement;
      expect.soft(text(action), status).toBe(label);
      expect.soft(action.getAttribute('href'), status).toBe(href);
    }
  });

  it('H T11. tag: a compact info chip with Check It For Me and #NT-10482 in nmNum; no reference → name only; no title → the category name', async () => {
    let h = await openHome({
      active: [errand({ id: 'e-1', status: 'RUNNER_EN_ROUTE', title: 'Apartment check — Nyali', reference: 'NT-10482' })],
    });
    const chip = card(h)?.querySelector('.nm-chip') as HTMLElement;
    expect(chip.classList.contains('nm-chip--compact')).toBe(true);
    expect(chip.classList.contains('nm-chip--info')).toBe(true);
    expect(text(chip.querySelector('[nmNum]'))).toBe('#NT-10482');
    expect(accessibleText(chip)).toBe('Check It For Me #NT-10482');
    expect(text(card(h)?.querySelector('.nm-active-task-card__title'))).toBe('Apartment check — Nyali');
    h = await openHome({ active: [errand({ id: 'e-1', reference: null, title: null })] });
    expect(card(h)?.querySelector('.nm-chip [nmNum]')).toBeNull();
    expect(accessibleText(card(h)?.querySelector('.nm-chip') as HTMLElement)).toBe('Check It For Me');
    expect(text(card(h)?.querySelector('.nm-active-task-card__title'))).toBe('Check It For Me');
  });

  it('H T12. card tokens: blue fill, white title, meta in Fira Code slate-400, a primary small button; no shadow, no raw hex', async () => {
    const h = await openHome({ active: [errand({ id: 'e-1', status: 'RUNNER_EN_ROUTE' })] });
    expect(declared('.nm-active-task-card', 'background-color')).toEqual(['var(--nitume-blue)']);
    const title = card(h)?.querySelector('.nm-active-task-card__title') as HTMLElement;
    expect(getComputedStyle(title).color).toBe('var(--nitume-white)');
    const meta = card(h)?.querySelector('.nm-active-task-card__meta') as HTMLElement;
    expect(meta.hasAttribute('nmNum')).toBe(true);
    expect(getComputedStyle(meta).fontFamily).toBe('var(--nitume-font-num)');
    expect(getComputedStyle(meta).color).toBe('var(--nitume-slate-400)');
    const action = card(h)?.querySelector('a.nm-btn') as HTMLElement;
    expect(action.className).toContain('nm-btn--primary');
    expect(action.className).toContain('nm-btn--small');
    expect(noShadow()).toBe(true);
  });

  it('H T13. +N more: three active → +2 more in progress with +2 in nmNum linking to Track; one active → absent', async () => {
    let h = await openHome({ active: [errand({ id: 'e-1' }), errand({ id: 'e-2' }), errand({ id: 'e-3' })] });
    const more = page(h).querySelector('.home__more a') as HTMLAnchorElement;
    expect(text(more)).toBe('+2 more in progress');
    expect(text(more.querySelector('[nmNum]'))).toBe('+2');
    expect(more.getAttribute('href')).toBe('/app/customer/track');
    h = await openHome({ active: [errand({ id: 'e-1' })] });
    expect(page(h).querySelector('.home__more')).toBeNull();
  });

  it('H T14. Recent: two rows at most; title fallback; formatDayTime(updatedAt ?? createdAt) in Fira Code with the injected now; chips; links to the task', async () => {
    const recent = [
      errand({ id: 'r-1', status: 'COMPLETED', title: 'Groceries', updatedAt: '2026-10-28T13:12:00.000Z' }),
      errand({ id: 'r-2', status: 'CANCELLED', title: null, category: 'queue_admin', createdAt: '2026-10-26T07:03:00.000Z', updatedAt: null }),
      errand({ id: 'r-3', status: 'CONFIRMED' }),
    ];
    let h = await openHome({ recent });
    expect(sectionLabels(h)).toEqual(['Categories', 'Recent']);
    expect(rows(h)).toHaveLength(2);
    expect(rows(h).map((r) => text(r.querySelector('.nm-task-row__title')))).toEqual(['Groceries', 'Wait For Me']);
    const metas = rows(h).map((r) => r.querySelector('[nmNum="meta"]') as HTMLElement);
    expect(metas.map((m) => text(m))).toEqual([
      formatDayTime('2026-10-28T13:12:00.000Z', NOW),
      formatDayTime('2026-10-26T07:03:00.000Z', NOW),
    ]);
    expect(getComputedStyle(metas[0]).fontFamily).toBe('var(--nitume-font-num)');
    expect(rows(h).map((r) => r.getAttribute('href'))).toEqual(['/app/customer/tasks/r-1', '/app/customer/tasks/r-2']);
    expect(text(rows(h)[0].querySelector('.nm-chip'))).toBe('Completed');
    expect(rows(h)[1].querySelector('.nm-chip')?.classList.contains('nm-chip--danger')).toBe(true);
    expect(text(rows(h)[1].querySelector('.nm-chip'))).toBe('Cancelled');
    h = await openHome({ recent: [errand({ id: 'r-9', status: 'CONFIRMED' })] });
    expect(text(rows(h)[0].querySelector('.nm-chip'))).toBe('Completed');
  });

  it('H T15. an unknown status in a list item drops the item (no chip, no card)', async () => {
    const h = await openHome({
      active: [errand({ id: 'x-1', status: 'TELEPORTING' }), errand({ id: 'e-2', status: 'QUOTED' })],
      recent: [errand({ id: 'x-2', status: 'VANISHED' })],
    });
    expect(text(card(h)?.querySelector('.nm-active-task-card__meta'))).toBe('Your quote is ready');
    expect(page(h).querySelector('.home__more')).toBeNull();
    expect(rows(h)).toEqual([]);
    expect(sectionLabels(h)).toEqual(['Categories', 'In progress']);
  });

  it('H T16. realtime: joins the active room; its status change reloads, another id does not; connected after reconnecting reloads once; a new active id leaves the old room; destroy leaves and unhooks; never location:update', async () => {
    const realtime = new FakeRealtime();
    const h = await openHome({ realtime, active: [errand({ id: 'e-1' })] });
    expect(realtime.joinErrand).toHaveBeenCalledWith('e-1');
    realtime.statusChanges$.next({ errandId: 'e-9', status: 'QUOTED', from: null, at: null });
    await h.detect();
    expect(httpMock().match(ACTIVE_URL)).toHaveLength(0);
    realtime.statusChanges$.next({ errandId: 'e-1', status: 'QUOTED', from: 'REQUESTED', at: null });
    await answerHome({ active: [errand({ id: 'e-2', status: 'QUOTED' })] });
    await h.detect();
    expect(realtime.leaveErrand).toHaveBeenCalledWith('e-1');
    expect(realtime.joinErrand).toHaveBeenLastCalledWith('e-2');
    realtime.set('reconnecting');
    realtime.set('connected');
    await answerHome({ active: [errand({ id: 'e-2', status: 'QUOTED' })] });
    realtime.set('connected');
    await h.detect();
    expect(httpMock().match(ACTIVE_URL)).toHaveLength(0); // once only
    expect(realtime.listeners.size).toBe(1);
    await h.harness.navigateByUrl('/app/customer/history');
    await h.detect();
    expect(realtime.leaveErrand).toHaveBeenLastCalledWith('e-2');
    expect(realtime.listeners.size).toBe(0);
    expect(realtime.locationSubscriptions).toBe(0);
  });

  it('H T17. polling every 30 s: none while connected; a reload while not connected and visible; none while hidden', async () => {
    const intervals: { fn: () => void; ms: number }[] = [];
    const original = window.setInterval.bind(window);
    vi.spyOn(window, 'setInterval').mockImplementation(((fn: () => void, ms?: number) => {
      if (ms === HOME_POLL_MS) intervals.push({ fn, ms });
      return original(() => undefined, 1e9);
    }) as typeof window.setInterval);
    const realtime = new FakeRealtime();
    const h = await openHome({ realtime });
    expect(intervals).toHaveLength(1);
    const tick = async () => {
      intervals[0].fn();
      await h.detect();
    };
    let visibility: DocumentVisibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    await tick();
    expect(httpMock().match(ACTIVE_URL)).toHaveLength(0);
    realtime.set('reconnecting');
    await tick();
    await answerHome();
    visibility = 'hidden';
    await tick();
    expect(httpMock().match(ACTIVE_URL)).toHaveLength(0);
  });

  it('H T18. layout: single column; @media (min-width: 768px) caps it at 640px; @media (min-width: 1024px) two columns, search + categories left and tasks right; DOM order unchanged', async () => {
    const h = await openHome({ active: [errand({ id: 'e-1' })] });
    expect(declared('.home__grid', 'max-width')).toEqual(['640px', 'none']);
    expect(declared('.home__grid', 'grid-template-columns')).toEqual(['minmax(0, 1fr) minmax(0, 1fr)']);
    expect(declared('.home__grid', 'gap')).toEqual(['24px']);
    const media = (min: string) =>
      Array.from(document.styleSheets).flatMap((s) =>
        Array.from(s.cssRules).filter((r) => r instanceof CSSMediaRule && r.conditionText.includes(`min-width: ${min}`)),
      ) as CSSMediaRule[];
    expect(media('768px').some((m) => m.cssText.includes('home__grid') && m.cssText.includes('max-width: 640px'))).toBe(true);
    expect(media('1024px').some((m) => m.cssText.includes('home__grid') && m.cssText.includes('grid-template-columns'))).toBe(true);
    const grid = page(h).querySelector('.home__grid') as HTMLElement;
    expect(Array.from(grid.children).map((c) => c.className)).toEqual(['home__start', 'home__tasks']);
    const order = Array.from(page(h).querySelectorAll('nm-top-bar, nm-search-entry, nm-category-grid, nm-active-task-card')).map((e) =>
      e.tagName.toLowerCase(),
    );
    expect(order).toEqual(['nm-top-bar', 'nm-search-entry', 'nm-category-grid', 'nm-active-task-card']);
  });

  it('H T19. no wallet or escrow words and no KES; categories never show wire values', async () => {
    const h = await openHome({
      active: [errand({ id: 'e-1', status: 'ACCEPTED', category: 'buy_for_me' })],
      recent: [errand({ id: 'r-1', status: 'COMPLETED', category: 'pickup_delivery' })],
    });
    const all = text(page(h));
    expect(all).not.toMatch(/wallet|escrow|\bKES\b/i);
    expect(all).not.toMatch(/buy_for_me|pickup_delivery|inspection|representation|queue_admin|business/);
  });
});
