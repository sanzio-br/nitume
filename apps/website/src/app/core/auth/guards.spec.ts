// Guards (auth-foundation §6.1, §6.5; §9.5 F9.30–F9.35).
import { Component, computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, Routes, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthApi } from './auth-api';
import { authGuard, guestGuard, hasNameGuard, needsNameGuard, otpStepGuard, roleGuard } from './guards';
import { validReturnUrl } from './role-routing';
import { RestoreResult, SessionStore, SessionUser } from './session.store';
import { SignInFlowStore } from './sign-in-flow.store';

@Component({ template: '' })
class Blank {}

class FakeSession {
  restore: RestoreResult = 'signedOut';
  readonly user = signal<SessionUser | null>(null);
  readonly hasName = computed(() => (this.user()?.displayName?.trim().length ?? 0) > 0);
  readonly ensureRestored = vi.fn(() => Promise.resolve(this.restore));
  readonly signOut = vi.fn(() => new Promise<never>(() => undefined));
  readonly dropSession = vi.fn(() => Promise.resolve());
  as(role: string, displayName: string | null = 'A Name'): this {
    this.restore = 'signedIn';
    this.user.set({ id: 'u', phone: '+254712345678', displayName, role, status: 'active' });
    return this;
  }
}

const blank = (path: string, data: Record<string, unknown> = {}) => ({ path, component: Blank, data });

function routes(): Routes {
  return [
    {
      path: 'app/customer',
      data: { role: 'customer' },
      children: [
        { ...blank('sign-in'), canActivate: [guestGuard] },
        { ...blank('sign-in/code'), canActivate: [guestGuard, otpStepGuard] },
        { ...blank('name'), canActivate: [authGuard, roleGuard('customer'), needsNameGuard] },
        {
          path: '',
          canActivate: [authGuard, roleGuard('customer'), hasNameGuard],
          children: [blank('home'), blank('history')],
        },
      ],
    },
    {
      path: 'app/runner',
      data: { role: 'runner' },
      children: [
        { ...blank('sign-in'), canActivate: [guestGuard] },
        { ...blank('sign-in/code'), canActivate: [guestGuard, otpStepGuard] },
        { ...blank('name'), canActivate: [authGuard, roleGuard('runner'), needsNameGuard] },
        {
          path: '',
          canActivate: [authGuard, roleGuard('runner'), hasNameGuard],
          children: [blank('jobs'), blank('earnings')],
        },
      ],
    },
    blank('app/offline'),
  ];
}

async function go(session: FakeSession, url: string, runnerVerified = true): Promise<string> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes()),
      { provide: SessionStore, useValue: session },
      {
        provide: AuthApi,
        useValue: {
          runnerMe: () => of({ verification: { verified: runnerVerified, checks: [], level2Missing: [] } }),
          runnerVerifications: () => of([]),
        },
      },
    ],
  });
  const router = TestBed.inject(Router);
  await router.navigateByUrl(url);
  return router.url;
}

describe('guards (#6)', () => {
  it('F9.30. authGuard: signed out → sign-in with returnUrl (both roles); restore failed → /app/offline; signed in → allowed', async () => {
    expect(await go(new FakeSession(), '/app/customer/home')).toBe('/app/customer/sign-in?returnUrl=%2Fapp%2Fcustomer%2Fhome');
    expect(await go(new FakeSession(), '/app/runner/jobs')).toBe('/app/runner/sign-in?returnUrl=%2Fapp%2Frunner%2Fjobs');
    const failed = new FakeSession();
    failed.restore = 'failed';
    expect(await go(failed, '/app/customer/history')).toBe('/app/offline?returnUrl=%2Fapp%2Fcustomer%2Fhistory');
    expect(await go(new FakeSession().as('customer'), '/app/customer/history')).toBe('/app/customer/history');
  });

  it('F9.31. roleGuard: runner on customer → /app/runner/jobs; customer on runner → /app/customer/home; admin/business/unknown → signOut(not-allowed)', async () => {
    expect(await go(new FakeSession().as('runner'), '/app/customer/home')).toBe('/app/runner/jobs');
    expect(await go(new FakeSession().as('customer'), '/app/runner/jobs')).toBe('/app/customer/home');
    for (const role of ['admin', 'business', 'mystery']) {
      const s = new FakeSession().as(role);
      await go(s, '/app/customer/home');
      expect(s.signOut).toHaveBeenCalledWith('not-allowed', 'customer');
    }
  });

  it('F9.32. hasNameGuard without a name → /app/<role>/name; needsNameGuard with a name → the role home', async () => {
    expect(await go(new FakeSession().as('customer', null), '/app/customer/home')).toBe('/app/customer/name');
    expect(await go(new FakeSession().as('runner', ' '), '/app/runner/jobs')).toBe('/app/runner/name');
    expect(await go(new FakeSession().as('customer'), '/app/customer/name')).toBe('/app/customer/home');
    expect(await go(new FakeSession().as('runner'), '/app/runner/name')).toBe('/app/runner/jobs');
    expect(await go(new FakeSession().as('customer', null), '/app/customer/name')).toBe('/app/customer/name');
  });

  it('F9.33. guestGuard: with a session → the §6.2 destination; without → allowed; restore failed → allowed', async () => {
    expect(await go(new FakeSession().as('customer'), '/app/customer/sign-in')).toBe('/app/customer/home');
    expect(await go(new FakeSession().as('runner'), '/app/customer/sign-in')).toBe('/app/runner/jobs');
    expect(
      await go(new FakeSession().as('customer'), '/app/customer/sign-in?returnUrl=%2Fapp%2Fcustomer%2Fhistory'),
    ).toBe('/app/customer/history');
    expect(await go(new FakeSession(), '/app/customer/sign-in')).toBe('/app/customer/sign-in');
    const failed = new FakeSession();
    failed.restore = 'failed';
    expect(await go(failed, '/app/runner/sign-in')).toBe('/app/runner/sign-in');
    const admin = new FakeSession().as('admin');
    await go(admin, '/app/runner/sign-in');
    expect(admin.signOut).toHaveBeenCalledWith('not-allowed', 'runner');
  });

  it('F9.34. otpStepGuard without a stored phone → the phone screen; with one → allowed', async () => {
    expect(await go(new FakeSession(), '/app/customer/sign-in/code')).toBe('/app/customer/sign-in');
    TestBed.resetTestingModule();
    const session = new FakeSession();
    TestBed.configureTestingModule({
      providers: [provideRouter(routes()), { provide: SessionStore, useValue: session }],
    });
    TestBed.inject(SignInFlowStore).set('runner', { phone: '+254712345678', cooldownEndsAt: Date.now() });
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/app/runner/sign-in/code');
    expect(router.url).toBe('/app/runner/sign-in/code');
  });

  it('F9.35. returnUrl validation', () => {
    expect(validReturnUrl('/app/customer/history', 'customer')).toBe('/app/customer/history');
    expect(validReturnUrl('/app/customer/track/e-1?x=1', 'customer')).toBe('/app/customer/track/e-1?x=1');
    for (const bad of [
      'https://evil.test',
      '//evil.test',
      '/app/runner/jobs',
      '/app/customer/sign-in',
      '/app/customer/sign-in/code',
      '/app/customer/name',
      '/app/offline',
      '/business',
      '/app/customer//evil.test',
      'javascript:alert(1)',
      '/app/customer/\\evil',
      '',
      null,
    ]) {
      expect.soft(validReturnUrl(bad, 'customer'), String(bad)).toBeNull();
    }
  });
});
