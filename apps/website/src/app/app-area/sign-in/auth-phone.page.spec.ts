// customer-v-auth-phone T1–T14 (both roles), runner-v-auth-phone T1–T4,
// auth-foundation F9.18.
import { TestBed } from '@angular/core/testing';
import { API, apiError, expectRequest, httpMock, storageKeys, userJson } from '../../../testing/auth';
import { NO_LINKS, openApp, submitForm, text, typeInto } from '../../../testing/app-harness';
import { AppRole } from '../../core/auth/auth.tokens';
import { SignInFlowStore } from '../../core/auth/sign-in-flow.store';
import { NmToastService } from '../../shared/ui/overlay/toast.service';

const REQUEST = `${API}/auth/otp/request`;
const COPY = {
  customer: {
    heading: "Someone there, when you can't be.",
    sub: 'Enter your phone number to sign in or create an account.',
    legal: "By continuing you agree to Nitume's Terms & Privacy Policy.",
    wordmark: 'Nitume',
  },
  runner: {
    heading: 'Earn on your own schedule.',
    sub: 'Enter your phone number to sign in or apply as a Runner.',
    legal: "By continuing you agree to Nitume's Runner Terms & Privacy Policy.",
    wordmark: 'Nitume Runner',
  },
};

for (const role of ['customer', 'runner'] as const satisfies readonly AppRole[]) {
  describe(`${role} v-auth-phone (#6)`, () => {
    const url = `/app/${role}/sign-in`;
    const open = (query = '', opts: Parameters<typeof openApp>[1] = {}) => openApp(url + query, opts);
    const input = (root: HTMLElement) => root.querySelector('nm-field input') as HTMLInputElement;
    const alert = (root: HTMLElement) => root.querySelector('app-sign-in-message .message');

    afterEach(() => vi.useRealTimers());

    it('T1. renders wordmark, heading, sub, placeholder, button and legal line with the exact copy', async () => {
      const h = await open();
      const root = h.root();
      expect(root.querySelector('nm-wordmark .nm-wordmark')?.getAttribute('aria-label')).toBe(COPY[role].wordmark);
      expect(text(root.querySelector('h1'))).toBe(COPY[role].heading);
      expect(text(root.querySelector('.nm-auth-frame__sub'))).toBe(COPY[role].sub);
      expect(input(root).getAttribute('placeholder')).toBe('+254 7XX XXX XXX');
      expect(text(root.querySelector('button[type="submit"]'))).toBe('Send code');
      expect(text(root.querySelector('nm-legal-line'))).toBe(COPY[role].legal);
      // Accessibility: hidden label, tel input, Fira Code input text.
      expect(input(root).labels?.[0]?.textContent).toBe('Phone number');
      expect(input(root).getAttribute('type')).toBe('tel');
      expect(input(root).getAttribute('inputmode')).toBe('tel');
      expect(input(root).getAttribute('autocomplete')).toBe('tel');
      expect(input(root).classList.contains('nm-field__input--num')).toBe(true);
      expect(root.querySelector('app-header, app-footer')).toBeNull();
    });

    it('T2. an invalid number shows the field error, sends nothing; typing clears it', async () => {
      const h = await open();
      typeInto(input(h.root()), '0812345678');
      submitForm(h.root());
      await h.detect();
      expect(text(h.root().querySelector('.nm-field__error'))).toBe('Enter a valid Kenyan number, e.g. +254 712 345 678');
      expect(input(h.root()).getAttribute('aria-invalid')).toBe('true');
      httpMock().expectNone(REQUEST);
      typeInto(input(h.root()), '07');
      await h.detect();
      expect(h.root().querySelector('.nm-field__error')).toBeNull();
    });

    it("T3. '+254 712 345 678', '0712345678', '254712345678' each send { phone: '+254712345678' }", async () => {
      const h = await open();
      for (const value of ['+254 712 345 678', '0712345678', '254712345678']) {
        typeInto(input(h.root()), value);
        submitForm(h.root());
        const req = httpMock().expectOne(REQUEST);
        expect(req.request.body).toEqual({ phone: '+254712345678' });
        req.flush({ message: 'x' }, { status: 500, statusText: 'Error' });
        await h.detect();
      }
    });

    it('T4. loading: spinner, aria-busy, read-only field, a second submit sends nothing', async () => {
      const h = await open();
      typeInto(input(h.root()), '0712345678');
      submitForm(h.root());
      await h.detect();
      const button = h.root().querySelector('button[type="submit"]') as HTMLButtonElement;
      expect(button.getAttribute('aria-busy')).toBe('true');
      expect(button.querySelector('.nm-btn__spinner')).not.toBeNull();
      expect(input(h.root()).readOnly).toBe(true);
      submitForm(h.root());
      expect(httpMock().match(REQUEST)).toHaveLength(1);
    });

    it('T5. success stores the phone and cooldown ≈ now + 60 s and opens the code screen, keeping returnUrl', async () => {
      const returnUrl = `/app/${role}/profile`;
      const h = await open(`?returnUrl=${encodeURIComponent(returnUrl)}`);
      typeInto(input(h.root()), '0712345678');
      submitForm(h.root());
      const before = Date.now();
      httpMock().expectOne(REQUEST).flush({ message: 'sent' });
      await vi.waitFor(() => expect(h.router.url.split('?')[0]).toBe(`/app/${role}/sign-in/code`));
      const flow = TestBed.inject(SignInFlowStore).get(role);
      expect(flow?.phone).toBe('+254712345678');
      expect(flow!.cooldownEndsAt - before).toBeGreaterThanOrEqual(59_000);
      expect(flow!.cooldownEndsAt - before).toBeLessThanOrEqual(61_000);
      expect(h.router.parseUrl(h.router.url).queryParams['returnUrl']).toBe(returnUrl);
    });

    it('T6. otp_resend_cooldown with retryAfterSeconds 42 → no error, code screen with cooldown ≈ now + 42 s', async () => {
      const h = await open();
      typeInto(input(h.root()), '0712345678');
      submitForm(h.root());
      const e = apiError(429, 'otp_resend_cooldown', { retryAfterSeconds: 42, secondsRemaining: 42 });
      const before = Date.now();
      httpMock().expectOne(REQUEST).flush(e.body, e.opts);
      await vi.waitFor(() => expect(h.router.url).toBe(`/app/${role}/sign-in/code`));
      const left = TestBed.inject(SignInFlowStore).get(role)!.cooldownEndsAt - before;
      expect(left).toBeGreaterThanOrEqual(41_000);
      expect(left).toBeLessThanOrEqual(43_000);
    });

    it('T7. otp_rate_limited 61 s → "Too many code requests. Try again in 2 min." (2 in Fira Code); no value → "… later."', async () => {
      const h = await open();
      typeInto(input(h.root()), '0712345678');
      submitForm(h.root());
      let e = apiError(429, 'otp_rate_limited', { retryAfterSeconds: 61 });
      httpMock().expectOne(REQUEST).flush(e.body, e.opts);
      await h.detect();
      expect(text(alert(h.root()))).toBe('Too many code requests. Try again in 2 min.');
      expect(alert(h.root())?.getAttribute('role')).toBe('alert');
      const n = alert(h.root())?.querySelector('.nm-num') as HTMLElement;
      expect(text(n)).toBe('2');
      expect(getComputedStyle(n).fontFamily).toBe('var(--nitume-font-num)');
      expect((h.root().querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(false);
      submitForm(h.root());
      e = apiError(429, 'otp_rate_limited');
      httpMock().expectOne(REQUEST).flush(e.body, e.opts);
      await h.detect();
      expect(text(alert(h.root()))).toBe('Too many code requests. Try again later.');
    });

    it('T8. otp_ip_rate_limited → the same rate-limit line', async () => {
      const h = await open();
      typeInto(input(h.root()), '0712345678');
      submitForm(h.root());
      const e = apiError(429, 'otp_ip_rate_limited', { retryAfterSeconds: 600 });
      httpMock().expectOne(REQUEST).flush(e.body, e.opts);
      await h.detect();
      expect(text(alert(h.root()))).toBe('Too many code requests. Try again in 10 min.');
    });

    it("T9. otp_delivery_failed → \"We couldn't send the code. Try again.\"", async () => {
      const h = await open();
      typeInto(input(h.root()), '0712345678');
      submitForm(h.root());
      const e = apiError(400, 'otp_delivery_failed');
      httpMock().expectOne(REQUEST).flush(e.body, e.opts);
      await h.detect();
      expect(text(alert(h.root()))).toBe("We couldn't send the code. Try again.");
    });

    it('T10. status 0 → connection copy; 500 → generic copy', async () => {
      const h = await open();
      typeInto(input(h.root()), '0712345678');
      submitForm(h.root());
      httpMock().expectOne(REQUEST).error(new ProgressEvent('error'), { status: 0 });
      await h.detect();
      expect(text(alert(h.root()))).toBe('Check your connection and try again.');
      submitForm(h.root());
      httpMock().expectOne(REQUEST).flush({}, { status: 500, statusText: 'Error' });
      await h.detect();
      expect(text(alert(h.root()))).toBe('Something went wrong. Please try again.');
    });

    it('T11. legal line: configured URLs are new-tab links; empty and javascript: URLs are plain text', async () => {
      let h = await open('', {
        links: { [role]: { termsUrl: 'https://nitume.test/terms', privacyUrl: 'https://nitume.test/privacy', supportUrl: '' } },
      });
      let links = Array.from(h.root().querySelectorAll('nm-legal-line a')) as HTMLAnchorElement[];
      expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://nitume.test/terms', 'https://nitume.test/privacy']);
      for (const a of links) {
        expect(a.getAttribute('target')).toBe('_blank');
        expect(a.getAttribute('rel')).toBe('noopener noreferrer');
      }
      h = await open('', { links: { [role]: { ...NO_LINKS, termsUrl: 'javascript:alert(1)' } } });
      links = Array.from(h.root().querySelectorAll('nm-legal-line a')) as HTMLAnchorElement[];
      expect(links).toHaveLength(0);
      expect(text(h.root().querySelector('nm-legal-line'))).toBe(COPY[role].legal);
    });

    it('T12. ?signedOut=expired shows "Please sign in again." once and strips the parameter; suspended, not-allowed and foo', async () => {
      const cases: [string, string | null][] = [
        ['expired', 'Please sign in again.'],
        ['suspended', "This account can't sign in. Contact support."],
        ['not-allowed', "This number can't be used to sign in here. Use another number, or contact support."],
        ['foo', null],
      ];
      for (const [value, toast] of cases) {
        const h = await open(`?signedOut=${value}`);
        await vi.waitFor(() => expect(h.router.url).toBe(url));
        await h.detect();
        const host = h.root().querySelector('nm-toast-host') as HTMLElement;
        expect(text(host)).toBe(toast ?? '');
        expect(TestBed.inject(NmToastService).current()?.message ?? null).toBe(toast);
      }
    });

    it('T13. a signed-in visitor is sent on by guestGuard', async () => {
      const h = await open('', { restore: userJson({ role, displayName: 'Achieng' }) });
      expect(h.router.url).toBe(role === 'customer' ? '/app/customer/home' : '/app/runner/jobs');
    });

    it('T14. no localStorage or sessionStorage writes during the flow', async () => {
      localStorage.clear();
      sessionStorage.clear();
      const h = await open();
      typeInto(input(h.root()), '0712345678');
      submitForm(h.root());
      httpMock().expectOne(REQUEST).flush({ message: 'sent' });
      await vi.waitFor(() => expect(h.router.url).toBe(`/app/${role}/sign-in/code`));
      expect(storageKeys()).toEqual([]);
    });
  });
}

describe('runner v-auth-phone differences (#6)', () => {
  it('T1. the wordmark shows the Runner suffix and is named Nitume Runner', async () => {
    const h = await openApp('/app/runner/sign-in');
    const mark = h.root().querySelector('nm-wordmark .nm-wordmark') as HTMLElement;
    expect(mark.getAttribute('aria-label')).toBe('Nitume Runner');
    expect(text(mark.querySelector('.nm-wordmark__suffix'))).toBe('Runner');
  });

  it('T2. heading, sub and the legal line with Runner Terms', async () => {
    const h = await openApp('/app/runner/sign-in');
    expect(text(h.root().querySelector('h1'))).toBe('Earn on your own schedule.');
    expect(text(h.root().querySelector('.nm-auth-frame__sub'))).toBe('Enter your phone number to sign in or apply as a Runner.');
    expect(text(h.root().querySelector('nm-legal-line'))).toBe(
      "By continuing you agree to Nitume's Runner Terms & Privacy Policy.",
    );
  });

  it('T3. success navigates to /app/runner/sign-in/code', async () => {
    const h = await openApp('/app/runner/sign-in');
    typeInto(h.root().querySelector('nm-field input') as HTMLInputElement, '0733111222');
    submitForm(h.root());
    httpMock().expectOne(REQUEST).flush({ message: 'sent' });
    await vi.waitFor(() => expect(h.router.url).toBe('/app/runner/sign-in/code'));
  });

  it('T4. links come from links.runner', async () => {
    const h = await openApp('/app/runner/sign-in', {
      links: {
        customer: { termsUrl: 'https://c.test/t', privacyUrl: 'https://c.test/p', supportUrl: '' },
        runner: { termsUrl: 'https://r.test/t', privacyUrl: 'https://r.test/p', supportUrl: '' },
      },
    });
    const hrefs = Array.from(h.root().querySelectorAll('nm-legal-line a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['https://r.test/t', 'https://r.test/p']);
  });
});

describe('sign-out toasts on the phone screen (auth-foundation §4.5)', () => {
  it('F9.18. expired, suspended and not-allowed show their line once and strip the parameter; unknown shows nothing', async () => {
    for (const [value, expected] of [
      ['expired', 'Please sign in again.'],
      ['suspended', "This account can't sign in. Contact support."],
      ['not-allowed', "This number can't be used to sign in here. Use another number, or contact support."],
      ['unknown', null],
    ] as const) {
      ensureToastSpy();
      const h = await openApp(`/app/customer/sign-in?signedOut=${value}`);
      await vi.waitFor(() => expect(h.router.url).toBe('/app/customer/sign-in'));
      const show = vi.mocked(TestBed.inject(NmToastService).show);
      expect(show.mock.calls.length).toBe(expected ? 1 : 0);
      if (expected) expect(show.mock.calls[0][0]).toBe(expected);
      // Visiting again without the parameter shows nothing more.
      await h.harness.navigateByUrl('/app/runner/sign-in');
      await h.harness.navigateByUrl('/app/customer/sign-in');
      expect(show.mock.calls.length).toBe(expected ? 1 : 0);
      vi.restoreAllMocks();
    }
  });
});

function ensureToastSpy() {
  const original = NmToastService.prototype.show;
  vi.spyOn(NmToastService.prototype, 'show').mockImplementation(function (this: NmToastService, ...args) {
    return original.apply(this, args);
  });
}

void expectRequest;
