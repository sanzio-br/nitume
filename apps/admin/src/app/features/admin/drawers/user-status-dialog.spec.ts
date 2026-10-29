import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { API, flushAsync, httpError, setupHttp } from '../../../testing/admin-test-utils';
import { FORBIDDEN_COPY } from '../../../core/api-error';
import { UserStatusDialogComponent } from './user-status-dialog';
import {
  AccountAction,
  AccountAudience,
  actionCopy,
  BAD_REQUEST_COPY,
  OPEN_TASKS_NOTE,
  SAVE_ERROR,
  statusChangeFailure,
} from './user-status';

const USER = '0b9b7c4e-1111-4222-8333-0000000000aa';

describe('UserStatusDialogComponent (drawer-user-status §3.2)', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    http = setupHttp();
  });
  afterEach(() => http.verify());

  function render(action: AccountAction = 'suspend', audience: AccountAudience = 'runner') {
    const fixture = TestBed.createComponent(UserStatusDialogComponent);
    fixture.componentRef.setInput('userId', USER);
    fixture.componentRef.setInput('action', action);
    fixture.componentRef.setInput('audience', audience);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const textarea = () => el.querySelector('textarea') as HTMLTextAreaElement;
    const confirmBtn = () => el.querySelector('.confirm-actions .btn-primary') as HTMLButtonElement;
    const backBtn = () => el.querySelector('.confirm-actions .btn-outline') as HTMLButtonElement;
    const type = (value: string) => {
      textarea().value = value;
      textarea().dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    return { fixture, el, textarea, confirmBtn, backBtn, type };
  }

  describe('reason validation (§13.4)', () => {
    it('keeps confirm disabled for empty, whitespace-only and 9 trimmed characters', () => {
      const { confirmBtn, type } = render();
      expect(confirmBtn().disabled).toBe(true);
      type('           ');
      expect(confirmBtn().disabled).toBe(true);
      type('  123456789  ');
      expect(confirmBtn().disabled).toBe(true);
    });

    it('enables confirm at 10 and at 500 characters', () => {
      const { confirmBtn, type } = render();
      type('1234567890');
      expect(confirmBtn().disabled).toBe(false);
      type('x'.repeat(500));
      expect(confirmBtn().disabled).toBe(false);
    });

    it('caps the textarea at 500 characters', () => {
      const { textarea } = render();
      expect(textarea().getAttribute('maxlength')).toBe('500');
      expect(textarea().getAttribute('rows')).toBe('4');
    });

    it('updates the {n}/500 counter in .field-counter on every input', () => {
      const { el, type } = render();
      const counter = () => el.querySelector('.field-counter')?.textContent?.trim();
      expect(counter()).toBe('0/500');
      type('No-show');
      expect(counter()).toBe('7/500');
      type('  No-show  ');
      expect(counter()).toBe('11/500');
    });

    it('shows the error copy after blur', () => {
      const { el, textarea, type, fixture } = render();
      const error = () => el.querySelector('.field-error')?.textContent?.trim() ?? null;
      expect(error()).toBeNull();
      textarea().dispatchEvent(new Event('blur'));
      fixture.detectChanges();
      expect(error()).toBe('Enter a reason.');
      expect(el.querySelector('.field-counter')?.classList).toContain('is-error');
      type('   ');
      expect(error()).toBe('Enter a reason.');
      type('too short');
      expect(error()).toBe('Enter at least 10 characters.');
      type('Long enough now');
      expect(error()).toBeNull();
    });

    it('resets the reason when reopened', () => {
      const { fixture, textarea, type, el } = render();
      type('Repeated no-shows on paid tasks');
      fixture.componentRef.setInput('open', false);
      fixture.detectChanges();
      fixture.componentRef.setInput('open', true);
      fixture.detectChanges();
      expect(textarea().value).toBe('');
      expect(el.querySelector('.field-counter')?.textContent?.trim()).toBe('0/500');
    });

    it('uses the plain Fira Sans hint per audience', () => {
      const { el } = render('ban', 'customer');
      const hint = el.querySelector('.field-hint') as HTMLElement;
      expect(hint.textContent?.trim()).toBe(
        'Required, 10 to 500 characters. Kept in the account history. The customer never sees it.',
      );
      expect(hint.querySelector('.num')).toBeNull();
    });
  });

  describe('copy per action and audience (§13.5)', () => {
    const cases: [AccountAction, AccountAudience, string, string, string][] = [
      ['suspend', 'runner', 'Suspend this runner?', 'Suspend runner', 'Suspending…'],
      ['ban', 'runner', 'Ban this runner?', 'Ban runner', 'Banning…'],
      ['reactivate', 'runner', 'Reactivate this runner?', 'Reactivate runner', 'Reactivating…'],
      ['suspend', 'customer', 'Suspend this customer?', 'Suspend customer', 'Suspending…'],
      ['ban', 'customer', 'Ban this customer?', 'Ban customer', 'Banning…'],
      [
        'reactivate',
        'customer',
        'Reactivate this customer?',
        'Reactivate customer',
        'Reactivating…',
      ],
    ];

    for (const [action, who, title, confirm, busy] of cases) {
      it(`${action} / ${who}: title, body, confirm and busy labels`, async () => {
        const { el, confirmBtn, type, fixture } = render(action, who);
        expect(el.querySelector('h3')?.textContent?.trim()).toBe(title);
        expect(el.querySelector('.confirm-body p')?.textContent?.trim()).toBe(
          actionCopy(action, who).body,
        );
        expect(confirmBtn().textContent?.trim()).toBe(confirm);
        expect(el.querySelector('[role="dialog"]')).not.toBeNull();
        type('Repeated no-shows on paid tasks');
        confirmBtn().click();
        fixture.detectChanges();
        expect(confirmBtn().textContent?.trim()).toBe(busy);
        expect(confirmBtn().disabled).toBe(true);
        http.expectOne(`${API}/admin/users/${USER}/status`).flush(null);
        await flushAsync();
      });
    }

    it('says how the account is reached and that the reason is internal', () => {
      expect(actionCopy('suspend', 'runner').body).toBe(
        'They\'re signed out on every device straight away and can\'t use Nitume until an admin reactivates the account. They see a general "account suspended" message, not your reason.',
      );
      expect(actionCopy('ban', 'customer').body).toBe(
        'Use a ban for serious or repeated breaches. They\'re signed out on every device straight away and can\'t use Nitume. They see a general "account suspended" message, not your reason. An admin can reactivate a banned account later.',
      );
      expect(actionCopy('reactivate', 'runner').body).toBe(
        'They can sign in again with a new code sent to their phone. Devices signed out earlier stay signed out.',
      );
    });

    it('adds the SQ-4 open-tasks note to suspend and ban, not to reactivate', () => {
      expect(render('suspend').el.textContent).toContain(OPEN_TASKS_NOTE);
      expect(render('ban').el.textContent).toContain(OPEN_TASKS_NOTE);
      expect(render('reactivate').el.textContent).not.toContain(OPEN_TASKS_NOTE);
    });
  });

  describe('PATCH (§13.6)', () => {
    for (const [action, status] of [
      ['suspend', 'suspended'],
      ['ban', 'banned'],
      ['reactivate', 'active'],
    ] as const) {
      it(`${action} sends { status: ${status}, reason } as typed`, async () => {
        const { fixture, confirmBtn, type } = render(action);
        const changed = vi.fn();
        fixture.componentInstance.changed.subscribe(changed);
        type('  Repeated no-shows on paid tasks ');
        confirmBtn().click();
        const req = http.expectOne(`${API}/admin/users/${USER}/status`);
        expect(req.request.method).toBe('PATCH');
        expect(req.request.body).toEqual({
          status,
          reason: '  Repeated no-shows on paid tasks ',
        });
        const res = { user: { id: USER, role: 'runner', status }, change: { id: 'h1' } };
        req.flush(res);
        await flushAsync();
        expect(changed).toHaveBeenCalledWith(res);
      });
    }
  });

  describe('errors kept in the dialog (§7, §13.8)', () => {
    async function fail(status: number, body: Record<string, unknown> | null) {
      const r = render('suspend');
      const failed = vi.fn();
      r.fixture.componentInstance.failed.subscribe(failed);
      r.type('Repeated no-shows on paid tasks');
      r.confirmBtn().click();
      http.expectOne(`${API}/admin/users/${USER}/status`).flush(body, httpError(status, body));
      await flushAsync();
      r.fixture.detectChanges();
      return { ...r, failed };
    }
    const notice = (el: HTMLElement) =>
      el.querySelector('.confirm-body app-inline-notice')?.textContent?.trim() ?? null;

    it('400 status_reason_invalid: field error from extra.minLength/maxLength, text kept', async () => {
      const { el, textarea, failed } = await fail(400, {
        statusCode: 400,
        code: 'status_reason_invalid',
        minLength: 12,
        maxLength: 400,
      });
      expect(el.querySelector('.field-error')?.textContent?.trim()).toBe(
        'Enter a reason of 12 to 400 characters.',
      );
      expect(textarea().value).toBe('Repeated no-shows on paid tasks');
      expect(failed).not.toHaveBeenCalled();
    });

    it('400 other: generic request copy in the dialog', async () => {
      const { el } = await fail(400, { statusCode: 400, message: ['status must be one of'] });
      expect(notice(el)).toContain(BAD_REQUEST_COPY);
    });

    it('403 without a code: FORBIDDEN_COPY, confirm stays disabled', async () => {
      const { el, confirmBtn } = await fail(403, { statusCode: 403, message: 'Forbidden' });
      expect(notice(el)).toContain(FORBIDDEN_COPY);
      expect(confirmBtn().disabled).toBe(true);
    });

    it('status 0: save copy, reason kept, confirm re-enabled', async () => {
      const { el, textarea, confirmBtn } = await fail(0, null);
      expect(notice(el)).toContain(SAVE_ERROR);
      expect(textarea().value).toBe('Repeated no-shows on paid tasks');
      expect(confirmBtn().disabled).toBe(false);
    });

    it('5xx: same save copy', async () => {
      const { el } = await fail(503, { statusCode: 503 });
      expect(notice(el)).toContain(SAVE_ERROR);
    });

    it('section errors are handed to the parent', async () => {
      const { failed } = await fail(404, { statusCode: 404, code: 'user_not_found' });
      expect(failed).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'section', block: 'missing' }),
      );
    });
  });

  describe('discard prompt (§13.11)', () => {
    it('asks Discard this reason? and Back returns to the typed reason', () => {
      const { fixture, el, type, backBtn, textarea } = render();
      type('Repeated no-shows on paid tasks');
      expect(fixture.componentInstance.dirty()).toBe(true);
      const proceed = vi.fn();
      fixture.componentInstance.askDiscard(proceed);
      fixture.detectChanges();
      expect(el.querySelector('h3')?.textContent?.trim()).toBe('Discard this reason?');
      expect(backBtn().textContent?.trim()).toBe('Back');
      backBtn().click();
      fixture.detectChanges();
      expect(proceed).not.toHaveBeenCalled();
      expect(textarea().value).toBe('Repeated no-shows on paid tasks');
    });

    it('Discard closes and resumes the close', () => {
      const { fixture, el, type, confirmBtn } = render();
      const closed = vi.fn();
      fixture.componentInstance.closed.subscribe(closed);
      type('Repeated no-shows on paid tasks');
      const proceed = vi.fn();
      fixture.componentInstance.askDiscard(proceed);
      fixture.detectChanges();
      expect(confirmBtn().textContent?.trim()).toBe('Discard');
      confirmBtn().click();
      expect(closed).toHaveBeenCalled();
      expect(proceed).toHaveBeenCalled();
      expect(el).toBeTruthy();
    });

    it('is not dirty with an empty or whitespace reason', () => {
      const { fixture, type } = render();
      expect(fixture.componentInstance.dirty()).toBe(false);
      type('   ');
      expect(fixture.componentInstance.dirty()).toBe(false);
    });
  });
});

describe('statusChangeFailure (§7)', () => {
  it('maps 409 transition_not_allowed with from/to to the info copy and a reload', () => {
    expect(
      statusChangeFailure({
        status: 409,
        code: 'status_transition_not_allowed',
        message: '',
        messages: [],
        extra: { from: 'banned', to: 'suspended', allowed: ['active'] },
      }),
    ).toEqual({
      kind: 'section',
      tone: 'info',
      text: "This account is Banned now, so it can't be suspended. The latest status is shown.",
      reload: true,
    });
  });

  it('maps 401 to nothing (the auth interceptor refreshes or signs out)', () => {
    expect(statusChangeFailure({ status: 401, message: '', messages: [], extra: {} })).toEqual({
      kind: 'none',
    });
  });
});
