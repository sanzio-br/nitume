// Role routing (auth-foundation §6.2, §6.3; §9.6 F9.36–F9.44).
import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { API, authRig, httpMock, jwt, settle, userJson } from '../../../testing/auth';
import { RunnerMe, RunnerVerificationRecord } from '../api-types';
import type { AuthApi } from './auth-api';
import { isRoleMismatch } from './otp-policy';
import { destinationUrl, resolveDestination, runnerOnboardingStep } from './role-routing';
import { SessionStore } from './session.store';

const named = (role: string, displayName: string | null = 'Brian Kamau') => ({ role, displayName });

function fakeApi(me: RunnerMe | Error, records: RunnerVerificationRecord[] | Error = []) {
  const runnerMe = vi.fn((): Observable<RunnerMe> => (me instanceof Error ? throwError(() => me) : of(me)));
  const runnerVerifications = vi.fn(
    (): Observable<RunnerVerificationRecord[]> => (records instanceof Error ? throwError(() => records) : of(records)),
  );
  return { api: { runnerMe, runnerVerifications } as unknown as AuthApi, runnerMe, runnerVerifications };
}

const check = (type: string, side: 'front' | 'back' | null, status: string) => ({ type, side, status });
const unverified = (level2Missing: string[] | undefined, checks = [] as ReturnType<typeof check>[]): RunnerMe => ({
  verification: { verified: false, checks, ...(level2Missing ? { level2Missing } : {}) },
});

async function urlFor(input: Parameters<typeof resolveDestination>[0], api: AuthApi) {
  const d = resolveDestination(input);
  if (d.kind === 'refuse') return `refuse:${d.reason}`;
  return destinationUrl(d, api);
}

describe('resolveDestination and onboarding (#6)', () => {
  it('F9.36. customer flow + customer: with name → home, without → name, valid returnUrl → it', () => {
    expect(resolveDestination({ user: named('customer'), flowRole: 'customer', fresh: true })).toEqual({
      kind: 'navigate',
      url: '/app/customer/home',
    });
    expect(resolveDestination({ user: named('customer', '  '), flowRole: 'customer', fresh: true })).toEqual({
      kind: 'navigate',
      url: '/app/customer/name',
    });
    expect(
      resolveDestination({
        user: named('customer'),
        flowRole: 'customer',
        fresh: true,
        returnUrl: '/app/customer/history',
      }),
    ).toEqual({ kind: 'navigate', url: '/app/customer/history' });
  });

  it('F9.37. runner flow + verified runner with a name → /app/runner/jobs', async () => {
    const { api } = fakeApi({ verification: { verified: true, checks: [], level2Missing: [] } });
    expect(await urlFor({ user: named('runner'), flowRole: 'runner', fresh: true }, api)).toBe('/app/runner/jobs');
  });

  it('F9.38. runner applicant: fresh, no name → /app/runner/name; after the name save → the onboarding step', async () => {
    const { api, runnerMe } = fakeApi(
      unverified(['government_id_front', 'government_id_back', 'selfie'], [
        check('government_id', 'front', 'missing'),
        check('government_id', 'back', 'missing'),
        check('selfie', null, 'missing'),
      ]),
    );
    expect(await urlFor({ user: named('runner', null), flowRole: 'runner', fresh: true }, api)).toBe('/app/runner/name');
    expect(runnerMe).not.toHaveBeenCalled();
    expect(await urlFor({ user: named('runner'), flowRole: 'runner', fresh: true }, api)).toBe(
      '/app/runner/onboarding/id',
    );
  });

  it('F9.39. onboarding step for each case of §6.3', async () => {
    const step = (me: RunnerMe | Error, records?: RunnerVerificationRecord[] | Error) =>
      runnerOnboardingStep(fakeApi(me, records).api);
    expect(await step({ verification: { verified: true } })).toBe('shell');
    expect(await step(unverified([]))).toBe('pending');
    expect(
      await step(
        unverified(['government_id_back', 'selfie'], [
          check('government_id', 'front', 'approved'),
          check('government_id', 'back', 'missing'),
          check('selfie', null, 'missing'),
        ]),
      ),
    ).toBe('id');
    expect(
      await step(
        unverified(['government_id_back', 'selfie'], [
          check('government_id', 'back', 'pending'),
          check('selfie', null, 'missing'),
        ]),
      ),
    ).toBe('selfie');
    expect(
      await step(
        unverified(['government_id_front', 'government_id_back', 'selfie'], [
          check('government_id', 'front', 'pending'),
          check('government_id', 'back', 'rejected'),
          check('selfie', null, 'pending'),
        ]),
      ),
    ).toBe('pending');
    // level2Missing absent: records fallback, row 268 (approved unlabelled
    // ID fills the front; back labelled pending; selfie present).
    const fallback = fakeApi(unverified(undefined), [
      { verificationType: 'government_id', side: null, status: 'approved', createdAt: '2026-10-01T00:00:00Z' },
      { verificationType: 'government_id', side: 'back', status: 'pending', createdAt: '2026-10-02T00:00:00Z' },
      { verificationType: 'selfie', side: null, status: 'pending', createdAt: '2026-10-02T00:00:00Z' },
    ]);
    expect(await runnerOnboardingStep(fallback.api)).toBe('pending');
    expect(fallback.runnerVerifications).toHaveBeenCalledTimes(1);
    expect(await step(new HttpErrorResponse({ status: 500 }))).toBe('shell');
  });

  it('F9.40. a restored (not fresh) runner without verification goes to the shell, not onboarding', async () => {
    const { api, runnerMe } = fakeApi(unverified([]));
    expect(await urlFor({ user: named('runner'), flowRole: 'runner', fresh: false }, api)).toBe('/app/runner/jobs');
    expect(runnerMe).not.toHaveBeenCalled();
  });

  it('F9.41. runner flow + customer role → wrong-account refusal; dropSession() logs out, clears, no navigation', async () => {
    expect(resolveDestination({ user: named('customer'), flowRole: 'runner', fresh: true })).toEqual({
      kind: 'refuse',
      reason: 'wrong-account',
    });
    const rig = authRig({ pathname: '/app/runner/sign-in/code' });
    TestBed.configureTestingModule({ providers: rig.providers });
    const store = TestBed.inject(SessionStore);
    const done = store.completeSignIn({ user: userJson(), tokens: { accessToken: jwt(900) } });
    await settle();
    httpMock().expectOne(`${API}/users/me`).flush(userJson());
    await done;
    const dropped = store.dropSession();
    await settle();
    const logout = httpMock().expectOne(`${API}/auth/web/logout`);
    expect(logout.request.withCredentials).toBe(true);
    expect(logout.request.headers.has('Authorization')).toBe(false);
    logout.flush({});
    await dropped;
    expect(store.accessToken()).toBeNull();
    expect(rig.win.location.replace).not.toHaveBeenCalled();
  });

  it('F9.42. API role_mismatch on verify is recognised for the same refusal', () => {
    expect(isRoleMismatch(new HttpErrorResponse({ status: 403, error: { code: 'role_mismatch' } }))).toBe(true);
    expect(isRoleMismatch(new HttpErrorResponse({ status: 401, error: { code: 'otp_incorrect' } }))).toBe(false);
  });

  it('F9.43. customer flow + runner role → the runner destination (WQ-13); a customer returnUrl is dropped', async () => {
    const verified = fakeApi({ verification: { verified: true } });
    expect(await urlFor({ user: named('runner'), flowRole: 'customer', fresh: true }, verified.api)).toBe(
      '/app/runner/jobs',
    );
    const applicant = fakeApi(unverified(['selfie'], [check('selfie', null, 'missing')]));
    expect(await urlFor({ user: named('runner'), flowRole: 'customer', fresh: true }, applicant.api)).toBe(
      '/app/runner/onboarding/selfie',
    );
    expect(
      await urlFor(
        { user: named('runner'), flowRole: 'customer', fresh: false, returnUrl: '/app/customer/history' },
        verified.api,
      ),
    ).toBe('/app/runner/jobs');
  });

  it('F9.44. admin, business and an unknown role in either flow → not-allowed refusal', () => {
    for (const role of ['admin', 'business', 'superuser', '']) {
      for (const flowRole of ['customer', 'runner'] as const) {
        expect(resolveDestination({ user: named(role), flowRole, fresh: true })).toEqual({
          kind: 'refuse',
          reason: 'not-allowed',
        });
      }
    }
  });
});
