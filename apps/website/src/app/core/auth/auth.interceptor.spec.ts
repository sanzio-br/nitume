// authInterceptor (auth-foundation §5, §9.4 F9.20–F9.29).
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { API, AuthRig, apiError, authRig, httpMock, jwt, settle, userJson } from '../../../testing/auth';
import { SessionStore } from './session.store';

const REFRESH = `${API}/auth/web/refresh`;
const LOGOUT = `${API}/auth/web/logout`;
const ERRANDS = `${API}/errands`;

interface Setup {
  rig: AuthRig;
  http: HttpClient;
  store: SessionStore;
  token: string;
}

async function setup(): Promise<Setup> {
  TestBed.resetTestingModule();
  const rig = authRig({ pathname: '/app/customer/home' });
  TestBed.configureTestingModule({ providers: rig.providers });
  const store = TestBed.inject(SessionStore);
  const token = jwt(900, 'first');
  const done = store.completeSignIn({ user: userJson(), tokens: { accessToken: token } });
  await settle();
  httpMock().expectOne(`${API}/users/me`).flush(userJson());
  await done;
  return { rig, http: TestBed.inject(HttpClient), store, token };
}

function get(s: Setup, url = ERRANDS) {
  return firstValueFrom(s.http.get<unknown>(url)).then(
    (value) => ({ ok: true as const, value }),
    (error: HttpErrorResponse) => ({ ok: false as const, error }),
  );
}

async function finishSignOut() {
  await settle();
  httpMock().expectOne(LOGOUT).flush({});
  await settle();
}

describe('authInterceptor (#6)', () => {
  afterEach(() => httpMock().verify());

  it('F9.20. Bearer on /api/v1/** except otp/request and /auth/web/*; nothing outside apiBaseUrl; credentials on /auth/web/* only', async () => {
    const s = await setup();
    s.http.get(ERRANDS).subscribe();
    s.http.post(`${API}/auth/otp/request`, { phone: 'p' }).subscribe();
    s.http.post(`${API}/auth/web/refresh`, null).subscribe();
    s.http.post(`${API}/auth/web/otp/verify`, {}).subscribe();
    s.http.get('https://maps.googleapis.com/maps/api/geocode/json').subscribe();
    s.http.get('http://localhost:3000/socket.io/').subscribe();

    const errands = httpMock().expectOne(ERRANDS);
    expect(errands.request.headers.get('Authorization')).toBe(`Bearer ${s.token}`);
    expect(errands.request.withCredentials).toBe(false);
    const otp = httpMock().expectOne(`${API}/auth/otp/request`);
    expect(otp.request.headers.has('Authorization')).toBe(false);
    expect(otp.request.withCredentials).toBe(false);
    for (const url of [`${API}/auth/web/refresh`, `${API}/auth/web/otp/verify`]) {
      const req = httpMock().expectOne(url);
      expect(req.request.headers.has('Authorization')).toBe(false);
      expect(req.request.withCredentials).toBe(true);
    }
    for (const url of ['https://maps.googleapis.com/maps/api/geocode/json', 'http://localhost:3000/socket.io/']) {
      const req = httpMock().expectOne(url);
      expect(req.request.headers.has('Authorization')).toBe(false);
      expect(req.request.withCredentials).toBe(false);
    }
  });

  it('F9.21. refresh-then-retry: a 401 on GET /users/me refreshes once and retries with the new token', async () => {
    const s = await setup();
    const result = firstValueFrom(s.http.get<{ id: string }>(`${API}/users/me`));
    httpMock().expectOne(`${API}/users/me`).flush({}, { status: 401, statusText: 'Unauthorized' });
    await settle();
    const fresh = jwt(900, 'second');
    httpMock().expectOne(REFRESH).flush({ accessToken: fresh });
    await settle();
    const retry = httpMock().expectOne(`${API}/users/me`);
    expect(retry.request.headers.get('Authorization')).toBe(`Bearer ${fresh}`);
    retry.flush(userJson({ id: 'u-9' }));
    expect((await result).id).toBe('u-9');
    httpMock().expectNone(REFRESH);
  });

  it('F9.22. three parallel 401s cause exactly one refresh and three retries', async () => {
    const s = await setup();
    const results = [get(s, `${API}/a`), get(s, `${API}/b`), get(s, `${API}/c`)];
    for (const p of ['a', 'b', 'c']) {
      httpMock().expectOne(`${API}/${p}`).flush({}, { status: 401, statusText: 'Unauthorized' });
    }
    await settle();
    httpMock().expectOne(REFRESH).flush({ accessToken: jwt(900, 'n') });
    await settle();
    for (const p of ['a', 'b', 'c']) httpMock().expectOne(`${API}/${p}`).flush({ p });
    const values = await Promise.all(results);
    expect(values.map((v) => v.ok)).toEqual([true, true, true]);
  });

  it('F9.23. refresh failure sign-out: refresh_invalid and refresh_cookie_missing → signOut(expired), original error rethrown', async () => {
    for (const code of ['refresh_invalid', 'refresh_cookie_missing']) {
      const s = await setup();
      const result = get(s);
      const original = apiError(401, 'token_expired');
      httpMock().expectOne(ERRANDS).flush(original.body, original.opts);
      await settle();
      const e = apiError(401, code);
      httpMock().expectOne(REFRESH).flush(e.body, e.opts);
      const r = await result;
      expect(r.ok).toBe(false);
      if (!r.ok) expect((r.error.error as { code: string }).code).toBe('token_expired');
      await finishSignOut();
      expect(s.rig.win.location.replace).toHaveBeenCalledWith('/app/customer/sign-in?signedOut=expired');
    }
  });

  it('F9.24. refresh 401 account_suspended → signOut(suspended)', async () => {
    const s = await setup();
    const result = get(s);
    httpMock().expectOne(ERRANDS).flush({}, { status: 401, statusText: 'Unauthorized' });
    await settle();
    const e = apiError(401, 'account_suspended');
    httpMock().expectOne(REFRESH).flush(e.body, e.opts);
    expect((await result).ok).toBe(false);
    await finishSignOut();
    expect(s.rig.win.location.replace).toHaveBeenCalledWith('/app/customer/sign-in?signedOut=suspended');
  });

  it('F9.25. a protected call answering 401 account_suspended → signOut(suspended) without a refresh', async () => {
    const s = await setup();
    const result = get(s);
    const e = apiError(401, 'account_suspended');
    httpMock().expectOne(ERRANDS).flush(e.body, e.opts);
    expect((await result).ok).toBe(false);
    httpMock().expectNone(REFRESH);
    await finishSignOut();
    expect(s.rig.win.location.replace).toHaveBeenCalledWith('/app/customer/sign-in?signedOut=suspended');
  });

  it('F9.26. a retry answering 401 again → signOut(expired), no second refresh', async () => {
    const s = await setup();
    const result = get(s);
    httpMock().expectOne(ERRANDS).flush({}, { status: 401, statusText: 'Unauthorized' });
    await settle();
    httpMock().expectOne(REFRESH).flush({ accessToken: jwt(900, 'n') });
    await settle();
    httpMock().expectOne(ERRANDS).flush({}, { status: 401, statusText: 'Unauthorized' });
    expect((await result).ok).toBe(false);
    httpMock().expectNone(REFRESH);
    await finishSignOut();
    expect(s.rig.win.location.replace).toHaveBeenCalledWith('/app/customer/sign-in?signedOut=expired');
  });

  it('F9.27. refresh network failure → original error rethrown, no sign-out', async () => {
    const s = await setup();
    const result = get(s);
    httpMock().expectOne(ERRANDS).flush({}, { status: 401, statusText: 'Unauthorized' });
    await settle();
    httpMock().expectOne(REFRESH).error(new ProgressEvent('error'), { status: 0 });
    const r = await result;
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.status).toBe(401);
    await settle();
    httpMock().expectNone(LOGOUT);
    expect(s.rig.win.location.replace).not.toHaveBeenCalled();
    expect(s.store.accessToken()).toBe(s.token);
  });

  it('F9.28. a 401 on otp/request, web/otp/verify, web/refresh or web/logout never triggers a refresh', async () => {
    const s = await setup();
    const urls = [`${API}/auth/otp/request`, `${API}/auth/web/otp/verify`, REFRESH, LOGOUT];
    const results = urls.map((url) =>
      firstValueFrom(s.http.post(url, null)).then(
        () => 'ok',
        (e: HttpErrorResponse) => e.status,
      ),
    );
    for (const url of urls) httpMock().expectOne(url).flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(await Promise.all(results)).toEqual([401, 401, 401, 401]);
    await settle();
    httpMock().expectNone(REFRESH);
    expect(s.rig.win.location.replace).not.toHaveBeenCalled();
  });

  it('F9.29. 403 and 500 pass through untouched', async () => {
    const s = await setup();
    for (const status of [403, 500]) {
      const result = get(s);
      httpMock().expectOne(ERRANDS).flush({ code: 'forbidden' }, { status, statusText: 'x' });
      const r = await result;
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.status).toBe(status);
    }
    await settle();
    httpMock().expectNone(REFRESH);
    httpMock().expectNone(LOGOUT);
  });
});
