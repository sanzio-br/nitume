// customer-v-auth-otp T1–T19 (both roles), runner-v-auth-otp T1–T7,
// auth-foundation F9.52 (verify part).
import { TestBed } from '@angular/core/testing';
import { API, apiError, expectRequest, httpMock, jwt, storageKeys, userJson } from '../../../testing/auth';
import { AppHarness, NO_LINKS, OpenOptions, openApp, submitForm, text, typeInto } from '../../../testing/app-harness';
import { UserMe } from '../../core/api-types';
import { AppRole } from '../../core/auth/auth.tokens';
import { SessionStore } from '../../core/auth/session.store';
import { SignInFlowStore } from '../../core/auth/sign-in-flow.store';

const VERIFY = `${API}/auth/web/otp/verify`;
const REQUEST = `${API}/auth/otp/request`;
const LOGOUT = `${API}/auth/web/logout`;
const ME = `${API}/users/me`;
const RUNNER_ME = `${API}/runners/me`;
const PHONE = '+254712345678';
const NOT_ALLOWED = "This number can't be used to sign in here. Use another number, or contact support.";
const WRONG_ACCOUNT = 'This number is registered as a customer account. Use another number, or contact support.';

async function openCode(role: AppRole, opts: OpenOptions & { query?: string; cooldown?: number } = {}): Promise<AppHarness> {
  return openApp(`/app/${role}/sign-in/code${opts.query ?? ''}`, {
    ...opts,
    flow: { role, flow: { phone: PHONE, cooldownEndsAt: Date.now() + (opts.cooldown ?? 60) * 1000 } },
  });
}

const codeInput = (h: AppHarness) => h.root().querySelector('nm-otp-field input') as HTMLInputElement;
const boxes = (h: AppHarness) => Array.from(h.root().querySelectorAll('.nm-otp__box')) as HTMLElement[];
const codeError = (h: AppHarness) => text(h.root().querySelector('.nm-otp__error'));
const other = (h: AppHarness) => text(h.root().querySelector('app-sign-in-message .message'));
const submitButton = (h: AppHarness) => h.root().querySelector('button[type="submit"]') as HTMLButtonElement;
const resendLine = (h: AppHarness) => h.root().querySelector('nm-otp-resend-line');

async function enter(h: AppHarness, code: string) {
  typeInto(codeInput(h), code);
  await h.detect();
}

/** Verify answered with `user`, then `/users/me`; optional runner summary. */
async function signInAs(h: AppHarness, user: UserMe, runnerMe?: unknown) {
  await enter(h, '123456');
  httpMock()
    .expectOne(VERIFY)
    .flush({ user, tokens: { accessToken: jwt(900), refreshToken: 'LEAK' } }, { status: 201, statusText: 'Created' });
  (await expectRequest(ME)).flush(user);
  if (runnerMe !== undefined) (await expectRequest(RUNNER_ME)).flush(runnerMe);
}

async function failVerify(h: AppHarness, status: number, code?: string, extra: Record<string, unknown> = {}, message?: string) {
  await enter(h, '123456');
  const e = apiError(status, code, extra);
  httpMock().expectOne(VERIFY).flush(message ? { statusCode: status, message } : e.body, e.opts);
  await h.detect();
}

const verified = { verification: { verified: true, checks: [], level2Missing: [] } };

for (const role of ['customer', 'runner'] as const) {
  describe(`${role} v-auth-otp (#6)`, () => {
    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('T1. copy: heading, sub with the formatted number in nmNum, button, resend line', async () => {
      const h = await openCode(role);
      expect(text(h.root().querySelector('h1'))).toBe('Enter the code');
      const sub = h.root().querySelector('.nm-auth-frame__sub') as HTMLElement;
      expect(text(sub)).toBe('We sent a 6-digit code to +254 712 345 678.');
      const num = sub.querySelector('.nm-num') as HTMLElement;
      expect(text(num)).toBe('+254 712 345 678');
      expect(getComputedStyle(num).fontFamily).toBe('var(--nitume-font-num)');
      expect(text(submitButton(h))).toBe('Verify & continue');
      expect(text(resendLine(h)?.querySelector('.nm-resend__line'))).toBe("Didn't get it? Resend code in 1:00");
      expect(h.root().querySelector('nm-pushed-header button[aria-label="Back"]')).not.toBeNull();
      expect(h.root().querySelector('nm-wordmark')).toBeNull();
    });

    it('T2. nm-otp-field: digits fill green boxes, letters stripped, paste keeps six, completed once, placeholders, focus ring, red error', async () => {
      const h = await openCode(role);
      expect(boxes(h).map((b) => text(b))).toEqual(['•', '•', '•', '•', '•', '•']);
      codeInput(h).dispatchEvent(new Event('focus'));
      await enter(h, '1a2');
      expect(codeInput(h).value).toBe('12');
      expect(boxes(h)[0].classList.contains('nm-otp__box--filled')).toBe(true);
      expect(boxes(h).findIndex((b) => b.classList.contains('nm-otp__box--focus'))).toBe(2);
      const paste = new Event('paste', { cancelable: true });
      Object.defineProperty(paste, 'clipboardData', { value: { getData: () => 'Your code is 123456' } });
      codeInput(h).dispatchEvent(paste);
      await h.detect();
      expect(boxes(h).map((b) => text(b))).toEqual(['1', '2', '3', '4', '5', '6']);
      expect(httpMock().match(VERIFY)).toHaveLength(1); // completed once → one auto-submit
      httpMock().expectNone(VERIFY);
    });

    it('T3. the 6th digit auto-submits { phone, code, role } to /auth/web/otp/verify with credentials and no Authorization', async () => {
      const h = await openCode(role);
      await enter(h, '123456');
      const req = httpMock().expectOne(VERIFY);
      expect(req.request.body).toEqual({ phone: PHONE, code: '123456', role });
      expect(req.request.withCredentials).toBe(true);
      expect(req.request.headers.has('Authorization')).toBe(false);
    });

    it('T4. fewer than 6 digits + button → "Enter the 6-digit code.", no request', async () => {
      const h = await openCode(role);
      await enter(h, '123');
      submitForm(h.root());
      await h.detect();
      expect(codeError(h)).toBe('Enter the 6-digit code.');
      httpMock().expectNone(VERIFY);
    });

    it('T5. otp_incorrect → copy, boxes cleared, focus back in the input; every border red', async () => {
      const h = await openCode(role);
      await failVerify(h, 401, 'otp_incorrect', { attemptsRemaining: 3 });
      await vi.waitFor(() => expect(document.activeElement).toBe(codeInput(h)));
      expect(codeError(h)).toBe('That code is incorrect. Try again.');
      expect(codeInput(h).value).toBe('');
      expect(boxes(h).every((b) => b.classList.contains('nm-otp__box--error'))).toBe(true);
      expect(codeInput(h).getAttribute('aria-describedby')).toBe(h.root().querySelector('.nm-otp__error')?.id);
      // No attempts count is shown (attemptsRemaining: 3).
      expect(text(h.root())).not.toMatch(/\b3\b|attempts? (left|remaining)/i);
    });

    it('T6. lockout: otp_attempts_exhausted disables field and button; a resend re-enables them', async () => {
      const h = await openCode(role, { cooldown: 0 });
      await failVerify(h, 401, 'otp_attempts_exhausted');
      expect(codeError(h)).toBe('Too many incorrect attempts. Request a new code.');
      expect(codeInput(h).disabled).toBe(true);
      expect(submitButton(h).disabled).toBe(true);
      (resendLine(h)?.querySelector('button') as HTMLButtonElement).click();
      httpMock().expectOne(REQUEST).flush({ message: 'sent' });
      await vi.waitFor(async () => {
        await h.detect();
        expect(codeInput(h).disabled).toBe(false);
      });
      expect(submitButton(h).disabled).toBe(false);
      expect(codeError(h)).toBe('');
    });

    it('T7. otp_expired and otp_not_requested → expired copy, disabled until resend', async () => {
      for (const code of ['otp_expired', 'otp_not_requested']) {
        const h = await openCode(role);
        await failVerify(h, 401, code);
        expect(codeError(h)).toBe('This code has expired. Request a new code.');
        expect(codeInput(h).disabled).toBe(true);
        expect(submitButton(h).disabled).toBe(true);
      }
    });

    it('T8. resend: 1:00 → 0:59 → 0:00, link at zero, click sends requestOtp, toast, restarts at 1:00, clears boxes', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const h = await openCode(role);
      await enter(h, '12');
      await vi.advanceTimersByTimeAsync(1000);
      await h.detect();
      expect(text(resendLine(h))).toContain('0:59');
      await vi.advanceTimersByTimeAsync(59_000);
      await h.detect();
      const link = resendLine(h)?.querySelector('button') as HTMLButtonElement;
      expect(text(link)).toBe('Resend code');
      link.click();
      const req = httpMock().expectOne(REQUEST);
      expect(req.request.body).toEqual({ phone: PHONE });
      req.flush({ message: 'sent' });
      await h.detect();
      await h.detect();
      expect(text(h.root().querySelector('nm-toast-host'))).toBe('New code sent.');
      expect(text(resendLine(h))).toContain('1:00');
      expect(codeInput(h).value).toBe('');
      expect(TestBed.inject(SignInFlowStore).get(role)!.cooldownEndsAt).toBeGreaterThan(Date.now() + 59_000);
    });

    it('T9. resend otp_resend_cooldown with retryAfterSeconds 30 → countdown 0:30, no message', async () => {
      const h = await openCode(role, { cooldown: 0 });
      (resendLine(h)?.querySelector('button') as HTMLButtonElement).click();
      const e = apiError(429, 'otp_resend_cooldown', { retryAfterSeconds: 30 });
      httpMock().expectOne(REQUEST).flush(e.body, e.opts);
      await h.detect();
      await h.detect();
      expect(text(resendLine(h))).toContain('0:30');
      expect(other(h)).toBe('');
    });

    it('T10. resend otp_rate_limited → rate line with N in Fira Code; the resend line is hidden', async () => {
      const h = await openCode(role, { cooldown: 0 });
      (resendLine(h)?.querySelector('button') as HTMLButtonElement).click();
      const e = apiError(429, 'otp_rate_limited', { retryAfterSeconds: 1800 });
      httpMock().expectOne(REQUEST).flush(e.body, e.opts);
      await h.detect();
      await h.detect();
      expect(other(h)).toBe('Too many code requests. Try again in 30 min.');
      const n = h.root().querySelector('app-sign-in-message .nm-num') as HTMLElement;
      expect(getComputedStyle(n).fontFamily).toBe('var(--nitume-font-num)');
      expect(resendLine(h)).toBeNull();
    });

    it("T11. resend otp_delivery_failed → \"We couldn't send the code. Try again.\"", async () => {
      const h = await openCode(role, { cooldown: 0 });
      (resendLine(h)?.querySelector('button') as HTMLButtonElement).click();
      const e = apiError(400, 'otp_delivery_failed');
      httpMock().expectOne(REQUEST).flush(e.body, e.opts);
      await h.detect();
      await h.detect();
      expect(other(h)).toBe("We couldn't send the code. Try again.");
    });

    it('T12. the countdown is clock based: correct after a 20 s timer stall', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const h = await openCode(role);
      vi.setSystemTime(Date.now() + 20_000);
      await vi.advanceTimersByTimeAsync(1000);
      await h.detect();
      expect(text(resendLine(h))).toMatch(/0:3[89]/);
    });

    it('T13. the live region announces only at start and at zero', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const h = await openCode(role);
      const live = () => text(resendLine(h)?.querySelector('[aria-live]'));
      const seen = new Set([live()]);
      for (let i = 0; i < 61; i++) {
        await vi.advanceTimersByTimeAsync(1000);
        await h.detect();
        seen.add(live());
      }
      expect([...seen]).toEqual([expect.stringMatching(/^You can resend in (59|60) seconds\.$/), 'You can resend the code now.']);
    });

    it('T14. account_suspended (and an uncoded 401) → suspended line; Contact support only when supportUrl is set', async () => {
      let h = await openCode(role);
      await failVerify(h, 401, 'account_suspended');
      expect(other(h)).toBe("This account can't sign in. Contact support.");
      expect(h.root().querySelector('app-sign-in-message a')).toBeNull();
      h = await openCode(role, {
        links: { [role]: { ...NO_LINKS, supportUrl: 'mailto:help@nitume.test' } },
      });
      await failVerify(h, 401, undefined, {}, 'Unauthorized');
      expect(other(h)).toBe("This account can't sign in. Contact support.");
      const link = h.root().querySelector('app-sign-in-message a') as HTMLAnchorElement;
      expect(text(link)).toBe('Contact support');
      expect(link.getAttribute('href')).toBe('mailto:help@nitume.test');
      expect(link.getAttribute('target')).toBe('_blank');
    });

    it('T15. success routing with replaceUrl (role-specific cases; WQ-13 for a runner on the customer flow; admin refused)', async () => {
      const go = async (user: UserMe, runnerMe?: unknown, query = '') => {
        const h = await openCode(role, { query });
        const nav = vi.spyOn(h.router, 'navigateByUrl');
        await signInAs(h, user, runnerMe);
        return { h, nav };
      };
      const expectNav = async (r: { h: AppHarness; nav: { mock: { calls: unknown[][] } } }, url: string) => {
        await vi.waitFor(() => expect(r.h.router.url).toBe(url));
        const call = r.nav.mock.calls.find((c: unknown[]) => String(c[0]) === url);
        expect(call?.[1]).toMatchObject({ replaceUrl: true });
      };
      if (role === 'customer') {
        await expectNav(await go(userJson({ displayName: null })), '/app/customer/name');
        await expectNav(await go(userJson()), '/app/customer/home');
        await expectNav(
          await go(userJson(), undefined, `?returnUrl=${encodeURIComponent('/app/customer/history')}`),
          '/app/customer/history',
        );
        await expectNav(await go(userJson({ role: 'runner' }), verified), '/app/runner/jobs');
      } else {
        await expectNav(await go(userJson({ role: 'runner', displayName: null })), '/app/runner/name');
        await expectNav(await go(userJson({ role: 'runner' }), verified), '/app/runner/jobs');
      }
      const h = await openCode(role);
      await signInAs(h, userJson({ role: 'admin' }));
      const logout = await expectRequest(LOGOUT);
      expect(logout.request.withCredentials).toBe(true);
      logout.flush({});
      await vi.waitFor(async () => {
        await h.detect();
        expect(other(h)).toBe(NOT_ALLOWED);
      });
      expect(h.router.url).toBe(`/app/${role}/sign-in/code`);
      expect(TestBed.inject(SessionStore).accessToken()).toBeNull();
    });

    it('T16. Back → the phone screen with the number prefilled', async () => {
      const h = await openCode(role);
      (h.root().querySelector('nm-pushed-header button[aria-label="Back"]') as HTMLButtonElement).click();
      await vi.waitFor(() => expect(h.router.url).toBe(`/app/${role}/sign-in`));
      await h.detect();
      expect((h.root().querySelector('nm-field input') as HTMLInputElement).value).toBe('+254 712 345 678');
    });

    it('T17. a reload without flow state → the phone screen (otpStepGuard)', async () => {
      const h = await openApp(`/app/${role}/sign-in/code`);
      expect(h.router.url).toBe(`/app/${role}/sign-in`);
    });

    it('T18. verify otp_ip_rate_limited → "Too many attempts. Try again in N min." (N in Fira Code; later without a value)', async () => {
      let h = await openCode(role);
      await failVerify(h, 429, 'otp_ip_rate_limited', { retryAfterSeconds: 120 });
      expect(other(h)).toBe('Too many attempts. Try again in 2 min.');
      expect(text(h.root().querySelector('app-sign-in-message .nm-num'))).toBe('2');
      h = await openCode(role);
      await failVerify(h, 429, 'otp_ip_rate_limited');
      expect(other(h)).toBe('Too many attempts. Try again later.');
    });

    it('T19. no storage writes; only tokens.accessToken is read from the verify response', async () => {
      localStorage.clear();
      sessionStorage.clear();
      const h = await openCode(role);
      await signInAs(h, userJson({ role, displayName: null }));
      await vi.waitFor(() => expect(h.router.url).toBe(`/app/${role}/name`));
      expect(storageKeys()).toEqual([]);
      const store = TestBed.inject(SessionStore);
      expect(store.accessToken()).toMatch(/^eyJ/);
      expect(Object.values(store).map(String).join(' ')).not.toContain('LEAK');
    });

    it('F9.52 (verify). 403 web_origin_not_allowed → "Something went wrong. Please try again."', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const h = await openCode(role);
      await failVerify(h, 403, 'web_origin_not_allowed');
      expect(other(h)).toBe('Something went wrong. Please try again.');
    });
  });
}

describe('code-screen refusals and returnUrl (#6, §9.11)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('F9.65. the not-allowed refusal clears the boxes; a nameless customer with a valid returnUrl goes to name?returnUrl=… and then to it', async () => {
    let h = await openCode('customer');
    await signInAs(h, userJson({ role: 'business' }));
    (await expectRequest(LOGOUT)).flush({});
    await vi.waitFor(async () => {
      await h.detect();
      expect(other(h)).toBe(NOT_ALLOWED);
    });
    expect(codeInput(h).value).toBe('');
    expect(boxes(h).map((b) => text(b))).toEqual(['•', '•', '•', '•', '•', '•']);
    expect(codeInput(h).disabled).toBe(false);

    const returnUrl = '/app/customer/history';
    h = await openCode('customer', { query: `?returnUrl=${encodeURIComponent(returnUrl)}` });
    await signInAs(h, userJson({ displayName: null }));
    await vi.waitFor(() =>
      expect(h.router.url).toBe(`/app/customer/name?returnUrl=${encodeURIComponent(returnUrl)}`),
    );
    await h.detect();
    typeInto(h.root().querySelector('nm-field input') as HTMLInputElement, 'Achieng Otieno');
    submitForm(h.root());
    httpMock().expectOne({ method: 'PATCH', url: ME }).flush(userJson({ displayName: 'Achieng Otieno' }));
    await vi.waitFor(() => expect(h.router.url).toBe(returnUrl));
  });
});

describe('runner v-auth-otp differences (#6)', () => {
  afterEach(() => vi.restoreAllMocks());

  it("T1. verify sends role: 'runner'", async () => {
    const h = await openCode('runner');
    await enter(h, '654321');
    expect(httpMock().expectOne(VERIFY).request.body).toEqual({ phone: PHONE, code: '654321', role: 'runner' });
  });

  it('T2. customer-role result → wrong-account line, boxes cleared, logout with credentials and no Bearer, token cleared, no navigation; support only when configured', async () => {
    for (const supportUrl of ['', 'https://nitume.test/help']) {
      const h = await openCode('runner', { links: { runner: { ...NO_LINKS, supportUrl } } });
      await signInAs(h, userJson({ role: 'customer' }));
      const logout = await expectRequest(LOGOUT);
      expect(logout.request.withCredentials).toBe(true);
      expect(logout.request.headers.has('Authorization')).toBe(false);
      logout.flush({});
      await vi.waitFor(async () => {
        await h.detect();
        expect(other(h)).toBe(WRONG_ACCOUNT);
      });
      expect(codeInput(h).value).toBe('');
      expect(codeInput(h).disabled).toBe(false);
      expect(TestBed.inject(SessionStore).accessToken()).toBeNull();
      expect(h.router.url).toBe('/app/runner/sign-in/code');
      expect(h.rig.win.location.replace).not.toHaveBeenCalled();
      expect(!!h.root().querySelector('app-sign-in-message a')).toBe(!!supportUrl);
    }
  });

  it('T3. API role_mismatch (simulated) → the same refusal', async () => {
    const h = await openCode('runner');
    await failVerify(h, 403, 'role_mismatch');
    (await expectRequest(LOGOUT)).flush({});
    await vi.waitFor(async () => {
      await h.detect();
      expect(other(h)).toBe(WRONG_ACCOUNT);
    });
    expect(h.router.url).toBe('/app/runner/sign-in/code');
  });

  it('T4. admin result → the not-allowed line and logout', async () => {
    const h = await openCode('runner');
    await signInAs(h, userJson({ role: 'admin' }));
    (await expectRequest(LOGOUT)).flush({});
    await vi.waitFor(async () => {
      await h.detect();
      expect(other(h)).toBe(NOT_ALLOWED);
    });
  });

  it('T5. runner applicant routing: name, id, selfie, pending, jobs, and jobs when GET /runners/me fails', async () => {
    const runner = (displayName: string | null = 'Brian Kamau') => userJson({ role: 'runner', displayName });
    const check = (type: string, side: string | null, status: string) => ({ type, side, status });
    const cases: [UserMe, unknown, string][] = [
      [runner(null), undefined, '/app/runner/name'],
      [
        runner(),
        {
          verification: {
            verified: false,
            level2Missing: ['government_id_front', 'government_id_back', 'selfie'],
            checks: [check('government_id', 'front', 'missing'), check('government_id', 'back', 'missing'), check('selfie', null, 'missing')],
          },
        },
        '/app/runner/onboarding/id',
      ],
      [
        runner(),
        {
          verification: {
            verified: false,
            level2Missing: ['government_id_front', 'government_id_back', 'selfie'],
            checks: [check('government_id', 'front', 'pending'), check('government_id', 'back', 'pending'), check('selfie', null, 'missing')],
          },
        },
        '/app/runner/onboarding/selfie',
      ],
      [runner(), { verification: { verified: false, level2Missing: [], checks: [] } }, '/app/runner/onboarding/pending'],
      [runner(), verified, '/app/runner/jobs'],
    ];
    for (const [user, me, url] of cases) {
      const h = await openCode('runner');
      await signInAs(h, user, me);
      await vi.waitFor(() => expect(h.router.url).toBe(url));
    }
    const h = await openCode('runner');
    await signInAs(h, runner());
    (await expectRequest(RUNNER_ME)).flush({}, { status: 500, statusText: 'Error' });
    await vi.waitFor(() => expect(h.router.url).toBe('/app/runner/jobs'));
  });

  it('T6. an older API without level2Missing uses GET /runners/me/verifications and the row-268 rule', async () => {
    const h = await openCode('runner');
    await signInAs(h, userJson({ role: 'runner' }), { verification: { verified: false, checks: [] } });
    (await expectRequest(`${API}/runners/me/verifications`)).flush([
      { verificationType: 'government_id', side: null, status: 'approved', createdAt: '2026-10-01T00:00:00Z' },
      { verificationType: 'government_id', side: null, status: 'approved', createdAt: '2026-10-02T00:00:00Z' },
    ]);
    await vi.waitFor(() => expect(h.router.url).toBe('/app/runner/onboarding/selfie'));
  });

  it('T7. returnUrl=/app/runner/earnings is honoured for a verified runner and ignored when the step is id', async () => {
    const query = `?returnUrl=${encodeURIComponent('/app/runner/earnings')}`;
    let h = await openCode('runner', { query });
    await signInAs(h, userJson({ role: 'runner' }), verified);
    await vi.waitFor(() => expect(h.router.url).toBe('/app/runner/earnings'));
    h = await openCode('runner', { query });
    await signInAs(h, userJson({ role: 'runner' }), {
      verification: { verified: false, level2Missing: ['government_id_front'], checks: [] },
    });
    await vi.waitFor(() => expect(h.router.url).toBe('/app/runner/onboarding/id'));
  });
});
