// customer-shell T1–T11, runner-shell T1–T8, auth-foundation F9.59.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { userJson } from '../../../testing/auth';
import { AppHarness, openApp, text } from '../../../testing/app-harness';
import { declared } from '../../../testing/css';
import { RealtimeService } from '../../core/realtime/realtime.service';

const customer = () => userJson({ role: 'customer' });
const runner = () => userJson({ role: 'runner', displayName: 'Brian Kamau' });
const nav = (h: AppHarness) => h.root().querySelector('nav[aria-label="Main"]') as HTMLElement | null;
const links = (h: AppHarness) => Array.from(nav(h)?.querySelectorAll('li a') ?? []) as HTMLAnchorElement[];
const active = (h: AppHarness) => links(h).filter((a) => a.getAttribute('aria-current') === 'page');

describe('customer shell (#6)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('T1. five nav links with the exact labels, order and hrefs', async () => {
    const h = await openApp('/app/customer/home', { restore: customer() });
    expect(links(h).map((a) => text(a))).toEqual(['Home', 'New task', 'Track', 'History', 'Profile']);
    expect(links(h).map((a) => a.getAttribute('href'))).toEqual([
      '/app/customer/home',
      '/app/customer/new',
      '/app/customer/track',
      '/app/customer/history',
      '/app/customer/profile',
    ]);
    expect(nav(h)?.querySelector('[role="tablist"]')).toBeNull();
  });

  it('T2. on /app/customer/history the History link is active (aria-current, green-700 class, its icon); the others inactive', async () => {
    const h = await openApp('/app/customer/history', { restore: customer() });
    expect(active(h).map((a) => text(a))).toEqual(['History']);
    const history = active(h)[0];
    expect(history.classList.contains('nm-app-nav__item--active')).toBe(true);
    expect(history.querySelector('nm-icon')?.getAttribute('data-icon')).toBe('history');
    const home = links(h)[0];
    expect(home.classList.contains('nm-app-nav__item--active')).toBe(false);
    expect(home.querySelector('nm-icon')?.getAttribute('data-icon')).toBe('home');
    await h.harness.navigateByUrl('/app/customer/profile');
    expect(active(h)[0].querySelector('nm-icon')?.getAttribute('data-icon')).toBe('person-filled');
  });

  it('T3. New task links to /app/customer/new and is the active item there from 768px', async () => {
    const h = await openApp('/app/customer/new', { restore: customer(), width: 1024 });
    expect(links(h)[1].getAttribute('href')).toBe('/app/customer/new');
    expect(active(h).map((a) => text(a))).toEqual(['New task']);
    expect(active(h)[0].querySelector('nm-icon')?.getAttribute('data-icon')).toBe('add-circle');
  });

  it('T4. track/:errandId keeps Track active', async () => {
    const h = await openApp('/app/customer/track/e-42', { restore: customer() });
    expect(active(h).map((a) => text(a))).toEqual(['Track']);
    expect(active(h)[0].querySelector('nm-icon')?.getAttribute('data-icon')).toBe('location-filled');
  });

  it('T5. below 768px the bottom bar; from 768px the side nav with the wordmark linking to /app/customer/home', async () => {
    let h = await openApp('/app/customer/home', { restore: customer(), width: 360 });
    expect(nav(h)?.classList.contains('nm-app-nav--bar')).toBe(true);
    h = await openApp('/app/customer/home', { restore: customer(), width: 1024 });
    expect(nav(h)?.classList.contains('nm-app-nav--side')).toBe(true);
    const mark = nav(h)?.querySelector('nm-wordmark a') as HTMLAnchorElement;
    expect(mark.getAttribute('href')).toBe('/app/customer/home');
    expect(mark.getAttribute('aria-label')).toBe('Nitume');
  });

  it('T6. a pushed route hides the bar below 768px and keeps the side nav with the parent active from 768px', async () => {
    let h = await openApp('/app/customer/new', { restore: customer(), width: 360 });
    expect(nav(h)).toBeNull();
    h = await openApp('/app/customer/new', { restore: customer(), width: 1024 });
    expect(nav(h)?.classList.contains('nm-app-nav--side')).toBe(true);
    expect(active(h).map((a) => text(a))).toEqual(['New task']);
  });

  it('T7. Skip to content is first in tab order and moves focus to <main>', async () => {
    const h = await openApp('/app/customer/home', { restore: customer() });
    const focusable = h.root().querySelectorAll('a[href], button, input, [tabindex]:not([tabindex="-1"])');
    expect(text(focusable[0])).toBe('Skip to content');
    (focusable[0] as HTMLAnchorElement).click();
    expect(document.activeElement).toBe(h.root().querySelector('main#content'));
  });

  it('T8. RealtimeService.connect() is called once on first render, not again on tab changes', async () => {
    const connect = vi.spyOn(RealtimeService.prototype, 'connect');
    const h = await openApp('/app/customer/home', { restore: customer() });
    await vi.waitFor(() => expect(connect).toHaveBeenCalledTimes(1));
    await h.harness.navigateByUrl('/app/customer/history');
    await h.harness.navigateByUrl('/app/customer/track');
    await h.detect();
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('T9. guards: a runner session ends on /app/runner/jobs; a nameless customer on the name page; signed out on sign-in with returnUrl', async () => {
    expect((await openApp('/app/customer/home', { restore: runner() })).router.url).toBe('/app/runner/jobs');
    expect((await openApp('/app/customer/home', { restore: userJson({ displayName: null }) })).router.url).toBe(
      '/app/customer/name',
    );
    expect((await openApp('/app/customer/home')).router.url).toBe(
      '/app/customer/sign-in?returnUrl=%2Fapp%2Fcustomer%2Fhome',
    );
  });

  it('T10. nav colours come only from --nitume-white, -slate-line, -slate-400, -slate-600, -green-700', async () => {
    await openApp('/app/customer/home', { restore: customer() });
    const allowed = ['white', 'slate', 'slate-line', 'slate-400', 'slate-600', 'green-700', 'green'];
    const source = readFileSync(resolve(process.cwd(), 'src/app/shared/ui/app-nav/app-nav.component.scss'), 'utf8');
    const used = [...source.matchAll(/var\(--nitume-([a-z0-9-]+)\)/g)].map((m) => m[1]);
    const colours = used.filter((t) => !/^(tap|r-|space|content|font)/.test(t));
    expect(colours.every((c) => allowed.includes(c))).toBe(true);
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    expect(declared('.nm-app-nav--bar .nm-app-nav__item', 'color')).toEqual([]);
    expect(declared('.nm-app-nav__item', 'color')).toEqual(['var(--nitume-slate-400)']);
    expect(declared('.nm-app-nav__item--active', 'color')).toContain('var(--nitume-green-700)');
    expect(declared('.nm-app-nav--side .nm-app-nav__item', 'color')).toEqual(['var(--nitume-slate-600)']);
    expect(declared('.nm-app-nav--bar', 'border-top')).toEqual(['1px solid var(--nitume-slate-line)']);
  });

  it('T11. stub routes render the label h1 and nothing else', async () => {
    const h = await openApp('/app/customer/history', { restore: customer() });
    const stub = h.root().querySelector('app-view-stub') as HTMLElement;
    expect(text(stub)).toBe('History');
    expect(stub.querySelectorAll('h1')).toHaveLength(1);
    expect(stub.textContent).not.toMatch(/TODO|Coming soon|Lorem/i);
    // A #7 stub without a label (the wizard replaced the #6 `new` stub).
    await h.harness.navigateByUrl('/app/customer/notifications');
    const skeleton = h.root().querySelector('app-view-stub') as HTMLElement;
    expect(skeleton.querySelector('h1')).toBeNull();
    expect(skeleton.querySelector('nm-skeleton-card')).not.toBeNull();
  });
});

describe('runner shell (#6)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('T1. four nav links with the exact labels, order and hrefs; Earnings uses the add-circle pair', async () => {
    const h = await openApp('/app/runner/earnings', { restore: runner() });
    expect(links(h).map((a) => text(a))).toEqual(['Jobs', 'Active', 'Earnings', 'Profile']);
    expect(links(h).map((a) => a.getAttribute('href'))).toEqual([
      '/app/runner/jobs',
      '/app/runner/active',
      '/app/runner/earnings',
      '/app/runner/profile',
    ]);
    expect(links(h)[2].querySelector('nm-icon')?.getAttribute('data-icon')).toBe('add-circle-filled');
    await h.harness.navigateByUrl('/app/runner/jobs');
    expect(links(h)[2].querySelector('nm-icon')?.getAttribute('data-icon')).toBe('add-circle');
  });

  it('T2. active item per route, including onboarding/pending with Jobs active from 768px', async () => {
    let h = await openApp('/app/runner/active', { restore: runner() });
    expect(active(h).map((a) => text(a))).toEqual(['Active']);
    expect(active(h)[0].querySelector('nm-icon')?.getAttribute('data-icon')).toBe('visibility-filled');
    h = await openApp('/app/runner/onboarding/pending', { restore: runner(), width: 1024 });
    expect(active(h).map((a) => text(a))).toEqual(['Jobs']);
    expect(active(h)[0].querySelector('nm-icon')?.getAttribute('data-icon')).toBe('work-filled');
  });

  it('T3. from 768px the side nav shows Nitume Runner linking to /app/runner/jobs; below 768px the bottom bar', async () => {
    let h = await openApp('/app/runner/jobs', { restore: runner(), width: 1024 });
    const mark = nav(h)?.querySelector('nm-wordmark a') as HTMLAnchorElement;
    expect(mark.getAttribute('aria-label')).toBe('Nitume Runner');
    expect(mark.getAttribute('href')).toBe('/app/runner/jobs');
    h = await openApp('/app/runner/jobs', { restore: runner(), width: 360 });
    expect(nav(h)?.classList.contains('nm-app-nav--bar')).toBe(true);
  });

  it('T4. pushed routes hide the bottom bar below 768px', async () => {
    const h = await openApp('/app/runner/onboarding/pending', { restore: runner(), width: 360 });
    expect(nav(h)).toBeNull();
  });

  it('T5. RealtimeService.connect() once on first render', async () => {
    const connect = vi.spyOn(RealtimeService.prototype, 'connect');
    const h = await openApp('/app/runner/jobs', { restore: runner() });
    await h.harness.navigateByUrl('/app/runner/earnings');
    await vi.waitFor(() => expect(connect).toHaveBeenCalledTimes(1));
    await h.detect();
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('T6. guards: customer → /app/customer/home; nameless runner → name; signed out → sign-in with returnUrl; an unverified runner is allowed', async () => {
    expect((await openApp('/app/runner/jobs', { restore: customer() })).router.url).toBe('/app/customer/home');
    expect(
      (await openApp('/app/runner/jobs', { restore: userJson({ role: 'runner', displayName: null }) })).router.url,
    ).toBe('/app/runner/name');
    expect((await openApp('/app/runner/jobs')).router.url).toBe('/app/runner/sign-in?returnUrl=%2Fapp%2Frunner%2Fjobs');
    // The restored user carries no verification: no route guard checks it.
    const h = await openApp('/app/runner/jobs', { restore: runner() });
    expect(h.router.url).toBe('/app/runner/jobs');
    expect(nav(h)).not.toBeNull();
  });

  it('T7. /app/runner/onboarding/id renders without the nav; /app/runner/onboarding/pending inside the shell', async () => {
    let h = await openApp('/app/runner/onboarding/id', { restore: runner() });
    expect(h.root().querySelector('nm-app-shell')).toBeNull();
    expect(nav(h)).toBeNull();
    expect(h.root().querySelector('app-view-stub nm-skeleton-card')).not.toBeNull();
    h = await openApp('/app/runner/onboarding/pending', { restore: runner(), width: 1024 });
    expect(h.root().querySelector('nm-app-shell app-view-stub')).not.toBeNull();
  });

  it('T8. shared shell checks for the runner configuration: skip link, token use, stubs', async () => {
    const h = await openApp('/app/runner/jobs', { restore: runner() });
    const first = h.root().querySelector('a[href], button') as HTMLAnchorElement;
    expect(text(first)).toBe('Skip to content');
    first.click();
    expect(document.activeElement).toBe(h.root().querySelector('main#content'));
    expect(text(h.root().querySelector('app-view-stub'))).toBe('Jobs');
    expect(declared('.nm-app-nav', 'background-color')).toEqual(['var(--nitume-white)']);
    expect(declared('.nm-app-nav__item--active', 'color')).toContain('var(--nitume-green-700)');
  });
});

describe('side nav on pushed routes (WQ-15, WQ-16)', () => {
  it('F9.59. from 768px a pushed route keeps the side nav with the parent item active; its background is --nitume-white', async () => {
    const h = await openApp('/app/runner/onboarding/pending', { restore: runner(), width: 1280 });
    const side = nav(h) as HTMLElement;
    expect(side.classList.contains('nm-app-nav--side')).toBe(true);
    expect(active(h).map((a) => text(a))).toEqual(['Jobs']);
    expect(getComputedStyle(side).backgroundColor).toBe('var(--nitume-white)');
    expect(declared('.nm-app-nav', 'background-color')).toEqual(['var(--nitume-white)']);
  });
});
