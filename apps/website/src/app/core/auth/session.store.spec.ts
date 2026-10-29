// SessionStore (auth-foundation §4, §9.2, §9.3, §9.10).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { NmToastService } from '../../shared/ui/overlay/toast.service';
import { RealtimeService } from '../realtime/realtime.service';
import {
  API,
  AuthRig,
  apiError,
  authRig,
  ensureLocalStorage,
  storageKeys,
  httpMock,
  jwt,
  settle,
  userJson,
} from '../../../testing/auth';
import { AuthApi } from './auth-api';
import { SIGN_OUT_HOOK, SignOutReason, WebLocks } from './auth.tokens';
import { LEGACY_STORAGE_KEYS, SessionStore } from './session.store';

const URLS = {
  verify: `${API}/auth/web/otp/verify`,
  refresh: `${API}/auth/web/refresh`,
  logout: `${API}/auth/web/logout`,
  me: `${API}/users/me`,
  mobileVerify: `${API}/auth/otp/verify`,
  mobileRefresh: `${API}/auth/refresh`,
  mobileLogout: `${API}/auth/logout`,
};

interface Setup {
  rig: AuthRig;
  store: SessionStore;
  api: AuthApi;
}

function setup(opts: Parameters<typeof authRig>[0] & { hook?: (r: SignOutReason) => Promise<void> } = {}): Setup {
  TestBed.resetTestingModule();
  const rig = authRig(opts);
  TestBed.configureTestingModule({
    providers: [...rig.providers, ...(opts.hook ? [{ provide: SIGN_OUT_HOOK, useValue: opts.hook }] : [])],
  });
  return { rig, store: TestBed.inject(SessionStore), api: TestBed.inject(AuthApi) };
}

/** OTP sign-in through the API and the store; `/users/me` answered. */
async function signIn(s: Setup, token = jwt(900), user = userJson()) {
  const verify = firstValueFrom(s.api.verifyOtp('+254712345678', '123456', 'customer'));
  httpMock().expectOne(URLS.verify).flush({ user, tokens: { accessToken: token, refreshToken: 'LEAK' } });
  const session = await verify;
  const done = s.store.completeSignIn(session);
  await settle();
  httpMock().expectOne(URLS.me).flush(user);
  return done;
}

/** Answers the hook-then-logout part of a sign-out. */
async function finishSignOut(s: { rig: AuthRig }, answer: 'ok' | 'error' = 'ok') {
  await settle();
  const req = httpMock().expectOne(URLS.logout);
  if (answer === 'ok') req.flush({ message: 'ok' });
  else req.flush({ message: 'boom' }, { status: 500, statusText: 'Error' });
  await vi.waitFor(() => expect(s.rig.win.location.replace).toHaveBeenCalled());
}

describe('SessionStore (#6)', () => {
  beforeEach(() => {
    ensureLocalStorage();
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('F9.6. after a successful verify no storage key is set and the token is readable only through accessToken()', async () => {
    const s = setup();
    const token = jwt(900);
    await signIn(s, token);
    expect(storageKeys()).toEqual([]);
    expect(s.store.accessToken()).toBe(token);
    expect(s.store.status()).toBe('signedIn');
    expect(Object.values(s.store)).not.toContain(token);
    expect(JSON.stringify(s.store.user())).not.toContain(token);
  });

  it('F9.7. no storage key after refresh, saveDisplayName and signOut', async () => {
    const s = setup();
    await signIn(s);
    const refreshed = s.store.refresh();
    httpMock().expectOne(URLS.refresh).flush({ accessToken: jwt(900, 'b'), refreshToken: 'LEAK' });
    expect(await refreshed).toBe('ok');
    expect(storageKeys()).toEqual([]);
    const saved = s.store.saveDisplayName('  Achieng  ');
    httpMock().expectOne(URLS.me).flush(userJson({ displayName: 'Achieng' }));
    await saved;
    expect(storageKeys()).toEqual([]);
    void s.store.signOut('user', 'customer');
    await finishSignOut(s);
    expect(storageKeys()).toEqual([]);
  });

  it('F9.8. a refreshToken in the verify or refresh body is ignored (not stored, never sent)', async () => {
    const s = setup();
    await signIn(s);
    const refreshed = s.store.refresh();
    httpMock().expectOne(URLS.refresh).flush({ accessToken: jwt(900, 'b'), refreshToken: 'LEAK-2' });
    await refreshed;
    const again = s.store.refresh();
    const req = httpMock().expectOne(URLS.refresh);
    expect(req.request.body).toBeNull();
    expect(JSON.stringify(req.request.headers.keys().map((k) => req.request.headers.getAll(k)))).not.toMatch(/LEAK/);
    req.flush({ accessToken: jwt(900, 'c') });
    await again;
    void s.store.signOut('user', 'customer');
    await settle();
    const logout = httpMock().expectOne(URLS.logout);
    expect(logout.request.body).toBeNull();
    logout.flush({});
    expect(Object.values(s.store).map(String).join(' ')).not.toMatch(/LEAK/);
    expect(storageKeys()).toEqual([]);
  });

  it('F9.9. the legacy keys nitume.ws.user|access|refresh are removed on construction', () => {
    for (const key of LEGACY_STORAGE_KEYS) localStorage.setItem(key, 'old');
    localStorage.setItem('unrelated', 'kept');
    setup();
    for (const key of LEGACY_STORAGE_KEYS) expect(localStorage.getItem(key)).toBeNull();
    expect(localStorage.getItem('unrelated')).toBe('kept');
  });

  it('F9.11. ensureRestored(): signedIn, signedOut without toast, failed, /users/me 401, single-flight', async () => {
    // refresh 201 + /users/me 200 → signedIn
    let s = setup();
    let restored = s.store.ensureRestored();
    httpMock().expectOne(URLS.refresh).flush({ accessToken: jwt(900) });
    await settle();
    httpMock().expectOne(URLS.me).flush(userJson());
    expect(await restored).toBe('signedIn');
    expect(s.store.user()?.displayName).toBe('Achieng Otieno');

    for (const code of ['refresh_cookie_missing', 'refresh_invalid']) {
      s = setup();
      restored = s.store.ensureRestored();
      const e = apiError(401, code);
      httpMock().expectOne(URLS.refresh).flush(e.body, e.opts);
      expect(await restored).toBe('signedOut');
      expect(s.store.status()).toBe('signedOut');
      expect(TestBed.inject(NmToastService).current()).toBeNull();
      expect(s.rig.win.location.replace).not.toHaveBeenCalled();
    }

    s = setup();
    restored = s.store.ensureRestored();
    httpMock().expectOne(URLS.refresh).error(new ProgressEvent('error'), { status: 0 });
    expect(await restored).toBe('failed');
    expect(s.store.status()).toBe('restoreFailed');

    s = setup();
    restored = s.store.ensureRestored();
    httpMock().expectOne(URLS.refresh).flush({ accessToken: jwt(900) });
    await settle();
    const e = apiError(401);
    httpMock().expectOne(URLS.me).flush(e.body, e.opts);
    expect(await restored).toBe('signedOut');
    expect(s.store.accessToken()).toBeNull();
    // The session's own /users/me 401 does not trigger a second refresh.
    httpMock().expectNone(URLS.refresh);

    s = setup();
    const a = s.store.ensureRestored();
    const b = s.store.ensureRestored();
    httpMock().expectOne(URLS.refresh).flush({ accessToken: jwt(900) });
    await settle();
    httpMock().expectOne(URLS.me).flush(userJson());
    expect(await a).toBe('signedIn');
    expect(await b).toBe('signedIn');
    httpMock().verify();
  });

  it('F9.64. after a signedOut restore no second refresh is made; after a failed restore the next call refreshes again', async () => {
    let s = setup();
    let restored = s.store.ensureRestored();
    const e = apiError(401, 'refresh_cookie_missing');
    httpMock().expectOne(URLS.refresh).flush(e.body, e.opts);
    expect(await restored).toBe('signedOut');
    expect(await s.store.ensureRestored()).toBe('signedOut');
    httpMock().expectNone(URLS.refresh);

    s = setup();
    restored = s.store.ensureRestored();
    httpMock().expectOne(URLS.refresh).error(new ProgressEvent('error'), { status: 0 });
    expect(await restored).toBe('failed');
    restored = s.store.ensureRestored();
    httpMock().expectOne(URLS.refresh).flush({ accessToken: jwt(900) });
    await settle();
    httpMock().expectOne(URLS.me).flush(userJson());
    expect(await restored).toBe('signedIn');
  });

  it('F9.12. completeSignIn keeps the verify user when GET /users/me fails; fresh flag once', async () => {
    const s = setup();
    const done = s.store.completeSignIn({
      user: userJson({ displayName: null, role: 'runner' }),
      tokens: { accessToken: jwt(900) },
    });
    await settle();
    httpMock().expectOne(URLS.me).flush({ message: 'down' }, { status: 503, statusText: 'Unavailable' });
    const user = await done;
    expect(user.role).toBe('runner');
    expect(s.store.user()?.role).toBe('runner');
    expect(s.store.status()).toBe('signedIn');
    expect(s.store.takeFreshSignIn()).toBe(true);
    expect(s.store.takeFreshSignIn()).toBe(false);
  });

  it('F9.13. freshAccessToken(): token far from exp, refresh within 30 s, null signed out or on failure', async () => {
    let s = setup();
    expect(await s.store.freshAccessToken()).toBeNull();
    httpMock().expectNone(URLS.refresh);

    const far = jwt(600);
    await signIn(s, far);
    expect(await s.store.freshAccessToken()).toBe(far);
    httpMock().expectNone(URLS.refresh);

    s = setup();
    await signIn(s, jwt(20));
    const next = jwt(900, 'new');
    const pending = s.store.freshAccessToken();
    await settle();
    httpMock().expectOne(URLS.refresh).flush({ accessToken: next });
    expect(await pending).toBe(next);

    s = setup();
    await signIn(s, jwt(10));
    const failing = s.store.freshAccessToken();
    await settle();
    httpMock().expectOne(URLS.refresh).error(new ProgressEvent('error'), { status: 0 });
    expect(await failing).toBeNull();
  });

  it("F9.14. refresh() runs inside navigator.locks.request('nitume-auth-refresh') and works without it", async () => {
    const request = vi.fn((_name: string, cb: () => Promise<unknown>) => cb());
    const locks = { request } as unknown as WebLocks;
    let s = setup({ locks });
    let r = s.store.refresh();
    await settle();
    httpMock().expectOne(URLS.refresh).flush({ accessToken: jwt(900) });
    expect(await r).toBe('ok');
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe('nitume-auth-refresh');

    s = setup({ locks: null });
    r = s.store.refresh();
    httpMock().expectOne(URLS.refresh).flush({ accessToken: jwt(900) });
    expect(await r).toBe('ok');
  });

  it("F9.15. signOut('user'): logout with credentials and no Bearer, cleared, realtime disconnected, broadcast, location.replace", async () => {
    const s = setup();
    await signIn(s);
    const disconnect = vi.spyOn(TestBed.inject(RealtimeService), 'disconnect');
    void s.store.signOut('user', 'customer');
    await settle();
    const logout = httpMock().expectOne(URLS.logout);
    expect(logout.request.withCredentials).toBe(true);
    expect(logout.request.headers.has('Authorization')).toBe(false);
    logout.flush({ message: 'Logged out' });
    await vi.waitFor(() => expect(s.rig.win.location.replace).toHaveBeenCalled());
    expect(s.store.accessToken()).toBeNull();
    expect(s.store.user()).toBeNull();
    expect(disconnect).toHaveBeenCalled();
    expect(s.rig.channel.posted).toEqual([{ type: 'signed-out' }]);
    expect(s.rig.win.location.replace).toHaveBeenCalledWith('/app/customer/sign-in');
  });

  it("F9.16. signOut('expired') and signOut('suspended') also log out and add ?signedOut=", async () => {
    for (const [reason, role] of [
      ['expired', 'customer'],
      ['suspended', 'runner'],
    ] as const) {
      const s = setup();
      await signIn(s);
      void s.store.signOut(reason, role);
      await finishSignOut(s);
      expect(s.rig.win.location.replace).toHaveBeenCalledWith(`/app/${role}/sign-in?signedOut=${reason}`);
    }
  });

  it('F9.17. a failing logout call does not block sign-out', async () => {
    const s = setup();
    await signIn(s);
    void s.store.signOut('expired', 'customer');
    await finishSignOut(s, 'error');
    expect(s.store.accessToken()).toBeNull();
    expect(s.rig.win.location.replace).toHaveBeenCalledWith('/app/customer/sign-in?signedOut=expired');
  });

  it('F9.19. a signed-out broadcast moves an /app tab to its sign-in page; a sign-in page or marketing page does nothing', async () => {
    let s = setup({ pathname: '/app/runner/jobs' });
    s.rig.channel.deliver({ type: 'signed-out' });
    expect(s.rig.win.location.replace).toHaveBeenCalledWith('/app/runner/sign-in');

    for (const path of ['/app/customer/sign-in', '/app/runner/sign-in/code', '/business']) {
      s = setup({ pathname: path });
      s.rig.channel.deliver({ type: 'signed-out' });
      s.rig.channel.deliver({ type: 'other' });
      expect(s.rig.win.location.replace).not.toHaveBeenCalled();
    }
  });

  it('F9.51. sign in, refresh and sign out never call the mobile verify, refresh or logout routes', async () => {
    const s = setup();
    await signIn(s);
    const r = s.store.refresh();
    httpMock().expectOne(URLS.refresh).flush({ accessToken: jwt(900) });
    await r;
    void s.store.signOut('user', 'customer');
    await finishSignOut(s);
    httpMock().expectNone(URLS.mobileVerify);
    httpMock().expectNone(URLS.mobileRefresh);
    httpMock().expectNone(URLS.mobileLogout);
    httpMock().verify();
  });

  it('F9.52 (refresh). 403 web_origin_not_allowed on refresh → rejected; one dev console.error naming WEB_ORIGINS', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const s = setup();
    for (let i = 0; i < 2; i++) {
      const r = s.store.refresh();
      const e = apiError(403, 'web_origin_not_allowed');
      httpMock().expectOne(URLS.refresh).flush(e.body, e.opts);
      expect(await r).toBe('rejected');
    }
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toContain('WEB_ORIGINS');
  });

  it('F9.53. SIGN_OUT_HOOK runs before logout with the reason; a rejecting or hanging hook does not block; default no-op; dropSession skips it', async () => {
    const calls: string[] = [];
    const hook = vi.fn(async (reason: SignOutReason) => {
      calls.push(`hook:${reason}:${httpMock().match(URLS.logout).length}`);
    });
    let s = setup({ hook });
    await signIn(s);
    void s.store.signOut('expired', 'customer');
    await finishSignOut(s);
    expect(calls).toEqual(['hook:expired:0']);

    s = setup({ hook: () => Promise.reject(new Error('push down')) });
    await signIn(s);
    void s.store.signOut('user', 'customer');
    await finishSignOut(s);
    expect(s.rig.win.location.replace).toHaveBeenCalled();

    vi.useFakeTimers();
    s = setup({ hook: () => new Promise<void>(() => undefined) });
    const done = s.store.completeSignIn({ user: userJson(), tokens: { accessToken: jwt(900) } });
    await settle();
    httpMock().expectOne(URLS.me).flush(userJson());
    await done;
    void s.store.signOut('user', 'runner');
    await settle();
    httpMock().expectNone(URLS.logout);
    await vi.advanceTimersByTimeAsync(3000);
    await finishSignOut(s);
    expect(s.rig.win.location.replace).toHaveBeenCalledWith('/app/runner/sign-in');
    vi.useRealTimers();

    s = setup();
    expect(await TestBed.inject(SIGN_OUT_HOOK)('user')).toBeUndefined();

    const spy = vi.fn(() => Promise.resolve());
    s = setup({ hook: spy });
    await signIn(s);
    const dropped = s.store.dropSession();
    await settle();
    httpMock().expectOne(URLS.logout).flush({});
    await dropped;
    expect(spy).not.toHaveBeenCalled();
    expect(s.store.accessToken()).toBeNull();
    expect(s.rig.win.location.replace).not.toHaveBeenCalled();
    expect(s.rig.channel.posted).toEqual([]);
  });

  it('F9.54. freshAccessToken(): rejected while signed in → signOut(expired); suspended → signOut(suspended); network → null, no sign-out', async () => {
    const cases = [
      { answer: apiError(401, 'refresh_invalid'), expected: '/app/runner/sign-in?signedOut=expired' },
      { answer: apiError(401, 'account_suspended'), expected: '/app/runner/sign-in?signedOut=suspended' },
    ];
    for (const c of cases) {
      const s = setup({ pathname: '/app/runner/jobs' });
      await signIn(s, jwt(5), userJson({ role: 'runner' }));
      const token = s.store.freshAccessToken();
      await settle();
      httpMock().expectOne(URLS.refresh).flush(c.answer.body, c.answer.opts);
      expect(await token).toBeNull();
      await finishSignOut(s);
      expect(s.rig.win.location.replace).toHaveBeenCalledWith(c.expected);
    }
    const s = setup({ pathname: '/app/runner/jobs' });
    await signIn(s, jwt(5), userJson({ role: 'runner' }));
    const token = s.store.freshAccessToken();
    await settle();
    httpMock().expectOne(URLS.refresh).flush({}, { status: 502, statusText: 'Bad Gateway' });
    expect(await token).toBeNull();
    await settle();
    httpMock().expectNone(URLS.logout);
    expect(s.rig.win.location.replace).not.toHaveBeenCalled();
  });
});

describe('legacy auth removed (#6, WQ-8)', () => {
  it('F9.9 (code). no AuthStore, ApiService or storage writes remain in app code; only the legacy-key cleanup (lazy-session.ts, session.store.ts) touches localStorage', () => {
    const appDir = resolve(process.cwd(), 'src/app');
    const offenders: string[] = [];
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
    for (const file of walk(appDir)) {
      if (!file.endsWith('.ts') || file.endsWith('.spec.ts')) continue;
      const source = readFileSync(file, 'utf8');
      if (/\b(AuthStore|ApiService)\b|localStorage\.setItem|sessionStorage|indexedDB|document\.cookie/.test(source)) {
        offenders.push(file);
      }
      if (/localStorage/.test(source) && !/core\/(auth\/session\.store|lazy-session\/lazy-session)\.ts$/.test(file)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
    const types = readFileSync(resolve(appDir, 'core/api-types.ts'), 'utf8');
    expect(types).not.toMatch(/TokenPair|OtpVerifyResult|RegisterResult|refreshToken/);
  });
});
