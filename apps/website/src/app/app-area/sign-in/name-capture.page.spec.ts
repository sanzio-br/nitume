// customer-x-name-capture T1–T8 (both roles), runner-x-name-capture T1–T3.
import { TestBed } from '@angular/core/testing';
import { API, expectRequest, httpMock, jwt, userJson } from '../../../testing/auth';
import { AppHarness, openApp, submitForm, text, typeInto } from '../../../testing/app-harness';
import { UserMe } from '../../core/api-types';
import { SessionStore } from '../../core/auth/session.store';

const ME = `${API}/users/me`;
const COPY = {
  customer: {
    heading: 'What should we call you?',
    sub: 'Your runner sees this name on your tasks.',
    label: 'Your name',
    placeholder: 'e.g. Achieng Otieno',
  },
  runner: {
    heading: "What's your name?",
    sub: 'Use the name on your National ID. Customers see your first name and initial.',
    label: 'Your full name',
    placeholder: 'e.g. Brian Kamau',
  },
};
const HOME = { customer: '/app/customer/home', runner: '/app/runner/jobs' };

const field = (h: AppHarness) => h.root().querySelector('nm-field input') as HTMLInputElement;
const error = (h: AppHarness) => text(h.root().querySelector('.nm-field__error'));

for (const role of ['customer', 'runner'] as const) {
  describe(`${role} x-name-capture (#6)`, () => {
    const nameless = () => userJson({ role, displayName: null });
    const open = (query = '') => openApp(`/app/${role}/name${query}`, { restore: nameless() });

    it('T1. copy: heading, sub, visible label, placeholder, button', async () => {
      const h = await open();
      expect(text(h.root().querySelector('h1'))).toBe(COPY[role].heading);
      expect(text(h.root().querySelector('.nm-auth-frame__sub'))).toBe(COPY[role].sub);
      const label = h.root().querySelector('nm-field label') as HTMLLabelElement;
      expect(text(label)).toBe(COPY[role].label);
      expect(label.classList.contains('nm-field__label--hidden')).toBe(false);
      expect(field(h).labels?.[0]).toBe(label);
      expect(field(h).getAttribute('placeholder')).toBe(COPY[role].placeholder);
      expect(text(h.root().querySelector('button[type="submit"]'))).toBe('Continue');
    });

    it('T2. "" and " A " → "Enter your name."; 61 characters → "Keep it under 60 characters."; no request', async () => {
      const h = await open();
      for (const value of ['', ' A ']) {
        typeInto(field(h), value);
        submitForm(h.root());
        await h.detect();
        expect(error(h)).toBe('Enter your name.');
      }
      typeInto(field(h), 'x'.repeat(61));
      submitForm(h.root());
      await h.detect();
      expect(error(h)).toBe('Keep it under 60 characters.');
      httpMock().expectNone({ method: 'PATCH', url: ME });
      typeInto(field(h), 'Ac');
      await h.detect();
      expect(error(h)).toBe('');
    });

    it("T3. '  Achieng Otieno  ' sends { displayName: 'Achieng Otieno' }", async () => {
      const h = await open();
      typeInto(field(h), '  Achieng Otieno  ');
      submitForm(h.root());
      const req = httpMock().expectOne({ method: 'PATCH', url: ME });
      expect(req.request.body).toEqual({ displayName: 'Achieng Otieno' });
      expect(req.request.headers.get('Authorization')).toMatch(/^Bearer /);
    });

    it('T4. saving: spinner, read-only field, no double submit', async () => {
      const h = await open();
      typeInto(field(h), 'Achieng');
      submitForm(h.root());
      await h.detect();
      const button = h.root().querySelector('button[type="submit"]') as HTMLButtonElement;
      expect(button.getAttribute('aria-busy')).toBe('true');
      expect(field(h).readOnly).toBe(true);
      submitForm(h.root());
      expect(httpMock().match({ method: 'PATCH', url: ME })).toHaveLength(1);
    });

    it("T5. API 400, 500 and status 0 → \"Couldn't save your name. Try again.\"", async () => {
      const h = await open();
      for (const fail of [
        (r: ReturnType<typeof httpMock>) => r.expectOne({ method: 'PATCH', url: ME }).flush({}, { status: 400, statusText: 'Bad' }),
        (r: ReturnType<typeof httpMock>) => r.expectOne({ method: 'PATCH', url: ME }).flush({}, { status: 500, statusText: 'Err' }),
        (r: ReturnType<typeof httpMock>) =>
          r.expectOne({ method: 'PATCH', url: ME }).error(new ProgressEvent('error'), { status: 0 }),
      ]) {
        typeInto(field(h), 'Achieng');
        submitForm(h.root());
        fail(httpMock());
        await vi.waitFor(async () => {
          await h.detect();
          expect(error(h)).toBe("Couldn't save your name. Try again.");
        });
      }
    });

    it('T6. success updates the session user and navigates to the home (or a valid returnUrl) with replaceUrl', async () => {
      for (const [query, target] of [
        ['', HOME[role]],
        [`?returnUrl=${encodeURIComponent(`/app/${role}/profile`)}`, `/app/${role}/profile`],
      ]) {
        const h = await open(query);
        const nav = vi.spyOn(h.router, 'navigateByUrl');
        typeInto(field(h), 'Achieng Otieno');
        submitForm(h.root());
        httpMock()
          .expectOne({ method: 'PATCH', url: ME })
          .flush(userJson({ role, displayName: 'Achieng Otieno' }));
        await vi.waitFor(() => expect(h.router.url).toBe(target));
        expect(TestBed.inject(SessionStore).user()?.displayName).toBe('Achieng Otieno');
        expect(nav.mock.calls.find((c) => c[0] === target)?.[1]).toMatchObject({ replaceUrl: true });
      }
    });

    it('T7. needsNameGuard sends a named user home; hasNameGuard sends a nameless user here', async () => {
      let h = await openApp(`/app/${role}/name`, { restore: userJson({ role }) });
      expect(h.router.url).toBe(HOME[role]);
      h = await openApp(HOME[role], { restore: userJson({ role, displayName: '' }) });
      expect(h.router.url).toBe(`/app/${role}/name`);
    });

    it('T8. autocomplete="name", autocapitalize="words", spellcheck="false" on the input', async () => {
      const h = await open();
      expect(field(h).getAttribute('autocomplete')).toBe('name');
      expect(field(h).getAttribute('autocapitalize')).toBe('words');
      expect(field(h).getAttribute('spellcheck')).toBe('false');
    });
  });
}

describe('runner x-name-capture differences (#6)', () => {
  it('T1. copy: Runner wordmark suffix, heading, sub, label, placeholder', async () => {
    const h = await openApp('/app/runner/name', { restore: userJson({ role: 'runner', displayName: null }) });
    expect(h.root().querySelector('nm-wordmark .nm-wordmark')?.getAttribute('aria-label')).toBe('Nitume Runner');
    expect(text(h.root().querySelector('h1'))).toBe("What's your name?");
    expect(text(h.root().querySelector('.nm-auth-frame__sub'))).toBe(
      'Use the name on your National ID. Customers see your first name and initial.',
    );
    expect(text(h.root().querySelector('nm-field label'))).toBe('Your full name');
    expect(field(h).getAttribute('placeholder')).toBe('e.g. Brian Kamau');
  });

  it('T2. fresh sign-in: save → onboarding step (id case and shell case)', async () => {
    const fresh = async (runnerMe: object, target: string) => {
      const h = await openApp('/app/runner/sign-in/code', {
        flow: { role: 'runner', flow: { phone: '+254712345678', cooldownEndsAt: Date.now() + 60_000 } },
      });
      const user: UserMe = userJson({ role: 'runner', displayName: null });
      typeInto(h.root().querySelector('nm-otp-field input') as HTMLInputElement, '123456');
      await h.detect();
      httpMock().expectOne(`${API}/auth/web/otp/verify`).flush({ user, tokens: { accessToken: jwt(900) } });
      (await expectRequest(ME)).flush(user);
      await vi.waitFor(() => expect(h.router.url).toBe('/app/runner/name'));
      await h.detect();
      typeInto(field(h), 'Brian Kamau');
      submitForm(h.root());
      httpMock().expectOne({ method: 'PATCH', url: ME }).flush(userJson({ role: 'runner', displayName: 'Brian Kamau' }));
      (await expectRequest(`${API}/runners/me`)).flush(runnerMe);
      await vi.waitFor(() => expect(h.router.url).toBe(target));
    };
    await fresh(
      { verification: { verified: false, level2Missing: ['government_id_front'], checks: [] } },
      '/app/runner/onboarding/id',
    );
    await fresh({ verification: { verified: true } }, '/app/runner/jobs');
  });

  it('T3. restored session: save → /app/runner/jobs without calling GET /runners/me', async () => {
    const h = await openApp('/app/runner/name', { restore: userJson({ role: 'runner', displayName: null }) });
    typeInto(field(h), 'Brian Kamau');
    submitForm(h.root());
    httpMock().expectOne({ method: 'PATCH', url: ME }).flush(userJson({ role: 'runner', displayName: 'Brian Kamau' }));
    await vi.waitFor(() => expect(h.router.url).toBe('/app/runner/jobs'));
    httpMock().expectNone(`${API}/runners/me`);
  });
});
