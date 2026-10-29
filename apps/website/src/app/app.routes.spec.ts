// Routes, layout, titles and focus (auth-foundation §9.1 F9.1–F9.5), the
// restore-failed page (F9.30, G6-11).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { NavigationEnd } from '@angular/router';
import { API, expectRequest, jwt, userJson } from '../testing/auth';
import { openApp, text } from '../testing/app-harness';
import { routes } from './app.routes';
import { MarketingLayoutComponent } from './layout/marketing-layout.component';

describe('app routes and frame (#6)', () => {
  it('F9.1. marketing routes render app-header and app-footer inside MarketingLayoutComponent; /app/** renders neither', async () => {
    for (const url of ['/', '/business', '/diaspora', '/runner']) {
      const h = await openApp(url, { restore: 'none' });
      const layout = h.root().querySelector('app-marketing-layout') as HTMLElement;
      expect.soft(layout, url).not.toBeNull();
      expect.soft(layout?.querySelector(':scope > app-header'), url).not.toBeNull();
      expect.soft(layout?.querySelector(':scope > main'), url).not.toBeNull();
      expect.soft(layout?.querySelector(':scope > app-footer'), url).not.toBeNull();
    }
    for (const [url, restore] of [
      ['/app/customer/sign-in', 'signedOut'],
      ['/app/customer/home', userJson()],
    ] as const) {
      const h = await openApp(url, { restore });
      expect(h.root().querySelector('app-header, app-footer, app-marketing-layout')).toBeNull();
    }
    // The layout is the former AppComponent template and styles, verbatim.
    const layoutSource = readFileSync(resolve(process.cwd(), 'src/app/layout/marketing-layout.component.ts'), 'utf8');
    expect(layoutSource).toContain('<app-header />\n    <main>\n      <router-outlet />\n    </main>\n    <app-footer />');
    expect(layoutSource).toContain('min-height: 100vh;\n      background: var(--white);');
    expect(routes[0].component).toBe(MarketingLayoutComponent);
  });

  it('F9.2. /app is lazy: the root routes reference it only through loadChildren', () => {
    const app = routes.find((r) => r.path === 'app');
    expect(app?.loadChildren).toBeTypeOf('function');
    expect(app?.component).toBeUndefined();
    expect(app?.loadComponent).toBeUndefined();
    const source = readFileSync(resolve(process.cwd(), 'src/app/app.routes.ts'), 'utf8');
    expect(source).not.toMatch(/^import .*app-area/m);
    expect(source).toMatch(/loadChildren: \(\) => import\('\.\/app-area\/app-area\.routes'\)/);
  });

  it('F9.3. /app/customer → home, /app/runner → jobs, /app/unknown → /app', async () => {
    let h = await openApp('/app/customer', { restore: userJson() });
    expect(h.router.url).toBe('/app/customer/home');
    h = await openApp('/app/runner', { restore: userJson({ role: 'runner' }) });
    expect(h.router.url).toBe('/app/runner/jobs');
    h = await openApp('/app/customer/home', { restore: userJson() });
    const ends: string[] = [];
    h.router.events.subscribe((e) => {
      if (e instanceof NavigationEnd) ends.push(e.urlAfterRedirects);
    });
    await h.harness.navigateByUrl('/app/unknown');
    await vi.waitFor(() => expect(ends[0]).toBe('/app'));
  });

  it('F9.4. route data.title produces the §2 document titles', async () => {
    const cases: [string, Parameters<typeof openApp>[1], string][] = [
      ['/app/customer/sign-in', {}, 'Sign in · Nitume'],
      ['/app/runner/sign-in', {}, 'Sign in · Nitume Runner'],
      [
        '/app/customer/sign-in/code',
        { flow: { role: 'customer', flow: { phone: '+254712345678', cooldownEndsAt: 0 } } },
        'Enter the code · Nitume',
      ],
      [
        '/app/runner/sign-in/code',
        { flow: { role: 'runner', flow: { phone: '+254712345678', cooldownEndsAt: 0 } } },
        'Enter the code · Nitume Runner',
      ],
      ['/app/customer/name', { restore: userJson({ displayName: null }) }, 'Your name · Nitume'],
      ['/app/runner/name', { restore: userJson({ role: 'runner', displayName: null }) }, 'Your name · Nitume Runner'],
    ];
    for (const [url, opts, title] of cases) {
      await openApp(url, opts);
      expect.soft(TestBed.inject(Title).getTitle(), url).toBe(title);
    }
    let h = await openApp('/app/customer/home', { restore: userJson() });
    for (const [path, title] of [
      ['home', 'Home'],
      ['track', 'Track'],
      ['history', 'History'],
      ['profile', 'Profile'],
    ]) {
      await h.harness.navigateByUrl(`/app/customer/${path}`);
      expect.soft(TestBed.inject(Title).getTitle()).toBe(`${title} · Nitume`);
    }
    h = await openApp('/app/runner/jobs', { restore: userJson({ role: 'runner' }) });
    for (const [path, title] of [
      ['jobs', 'Jobs'],
      ['active', 'Active'],
      ['earnings', 'Earnings'],
      ['profile', 'Profile'],
    ]) {
      await h.harness.navigateByUrl(`/app/runner/${path}`);
      expect.soft(TestBed.inject(Title).getTitle()).toBe(`${title} · Nitume Runner`);
    }
  });

  it('F9.5. focus moves to the page h1 (tabindex -1) after navigation inside /app', async () => {
    const h = await openApp('/app/customer/home', { restore: userJson() });
    await vi.waitFor(() => expect(document.activeElement?.tagName).toBe('H1'));
    expect(text(document.activeElement)).toBe('Home');
    expect(document.activeElement?.getAttribute('tabindex')).toBe('-1');
    await h.harness.navigateByUrl('/app/customer/history');
    await vi.waitFor(() => expect(text(document.activeElement)).toBe('History'));
  });

  it('F9.30 (offline). a failed restore opens /app/offline?returnUrl=… with the wordmark and the connection error', async () => {
    const h = await openApp('/app/runner/earnings', { restore: 'failed' });
    expect(h.router.url).toBe('/app/offline?returnUrl=%2Fapp%2Frunner%2Fearnings');
    expect(text(h.root().querySelector('.nm-state__message'))).toBe('Check your connection and try again.');
    expect(text(h.root().querySelector('nm-error-state button'))).toBe('Try again');
  });

  it('G6-11. the offline page: runner suffix from returnUrl; Try again re-runs the restore, then opens the validated returnUrl', async () => {
    const h = await openApp('/app/offline?returnUrl=%2Fapp%2Frunner%2Fearnings', { restore: 'none' });
    expect(text(h.root().querySelector('.nm-state__message'))).toBe('Check your connection and try again.');
    expect(h.root().querySelector('nm-wordmark .nm-wordmark')?.getAttribute('aria-label')).toBe('Nitume Runner');
    (h.root().querySelector('nm-error-state button') as HTMLButtonElement).click();
    (await expectRequest(`${API}/auth/web/refresh`)).flush({ accessToken: jwt(900) });
    (await expectRequest(`${API}/users/me`)).flush(userJson({ role: 'runner' }));
    await vi.waitFor(() => expect(h.router.url).toBe('/app/runner/earnings'));
  });

  it('F9.66. leaving /auth or /app for a marketing page restores the index.html title', async () => {
    const marketing = "Nitume — Someone there, when you can't be.";
    let h = await openApp('/auth');
    expect(TestBed.inject(Title).getTitle()).toBe('Sign in · Nitume');
    await h.harness.navigateByUrl('/');
    expect(TestBed.inject(Title).getTitle()).toBe(marketing);
    h = await openApp('/app/customer/sign-in');
    expect(TestBed.inject(Title).getTitle()).toBe('Sign in · Nitume');
    await h.harness.navigateByUrl('/business');
    expect(TestBed.inject(Title).getTitle()).toBe(marketing);
  });
});

