// `/auth` role chooser (auth-foundation §6.7, F9.57, F9.58; WQ-12, WQ-24).
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { userJson } from '../../../testing/auth';
import { openApp, text } from '../../../testing/app-harness';

describe('/auth role chooser (#6)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('F9.57. wordmark link to /, heading, sub and the two sign-in links; no marketing header or footer; signed-in visitors are sent to their area; a failed restore still shows the chooser', async () => {
    let h = await openApp('/auth');
    const root = h.root();
    const mark = root.querySelector('nm-wordmark a') as HTMLAnchorElement;
    expect(mark.getAttribute('href')).toBe('/');
    expect(mark.getAttribute('aria-label')).toBe('Nitume');
    expect(text(root.querySelector('h1'))).toBe('Sign in to Nitume');
    expect(text(root.querySelector('.nm-auth-frame__sub'))).toBe('Choose how you use Nitume.');
    const links = Array.from(root.querySelectorAll('nm-button a')) as HTMLAnchorElement[];
    expect(links.map((a) => [text(a), a.getAttribute('href')])).toEqual([
      ['I need tasks done', '/app/customer/sign-in'],
      ["I'm a Runner or want to become one", '/app/runner/sign-in'],
    ]);
    expect(links[0].classList.contains('nm-btn--primary')).toBe(true);
    expect(links[1].classList.contains('nm-btn--outline')).toBe(true);
    expect(root.querySelectorAll('button')).toHaveLength(0);
    expect(root.querySelector('app-header, app-footer, nm-legal-line')).toBeNull();
    expect(TestBed.inject(Title).getTitle()).toBe('Sign in · Nitume');
    await vi.waitFor(() => expect(document.activeElement).toBe(root.querySelector('h1')));
    // Tab order: wordmark, primary, outline.
    const focusables = Array.from(root.querySelectorAll('a[href]')).map((a) => text(a) || a.getAttribute('aria-label'));
    expect(focusables).toEqual(['Nitume', 'I need tasks done', "I'm a Runner or want to become one"]);
    // The runner link opens the runner sign-in in the app.
    links[1].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    await vi.waitFor(() => expect(h.router.url).toBe('/app/runner/sign-in'));

    for (const [user, target] of [
      [userJson(), '/app/customer/home'],
      [userJson({ role: 'runner' }), '/app/runner/jobs'],
    ] as const) {
      const nav = vi.spyOn(Router.prototype, 'navigateByUrl');
      h = await openApp('/auth', { restore: user });
      await vi.waitFor(() => expect(h.router.url).toBe(target));
      expect(nav.mock.calls.find((c) => c[0] === target)?.[1]).toMatchObject({ replaceUrl: true });
      nav.mockRestore();
    }

    h = await openApp('/auth', { restore: 'failed' });
    expect(h.router.url).toBe('/auth');
    expect(text(h.root().querySelector('h1'))).toBe('Sign in to Nitume');
  });

  it('F9.58. /app signed out → /auth', async () => {
    const h = await openApp('/app');
    await vi.waitFor(() => expect(h.router.url).toBe('/auth'));
    await h.detect();
    expect(text(h.root().querySelector('h1'))).toBe('Sign in to Nitume');
  });

  it('shows the splash (wordmark + hidden Loading status) while restoring', async () => {
    const h = await openApp('/auth', { restore: 'none' });
    expect(h.root().querySelector('app-splash [role="status"]')?.textContent).toBe('Loading');
    expect(h.root().querySelector('h1')).toBeNull();
  });
});

describe('old /auth page (#6, WQ-12)', () => {
  it('F9.57 (removal). the old AuthComponent and pages/auth/ no longer exist', () => {
    const appDir = resolve(process.cwd(), 'src/app');
    expect(existsSync(resolve(appDir, 'pages/auth'))).toBe(false);
    const routesSource = readFileSync(resolve(appDir, 'app.routes.ts'), 'utf8');
    expect(routesSource).not.toContain('AuthComponent');
  });
});
