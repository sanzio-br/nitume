import { TestBed } from '@angular/core/testing';
import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import type { HttpRequest } from '@angular/common/http';
import { API, flushAsync, httpError, setupHttpWithAuth } from '../../../testing/admin-test-utils';
import { FORBIDDEN_COPY } from '../../../core/api-error';
import type {
  AdminUserSummary,
  RunnerListItem,
  UserStatus,
  UserStatusHistoryItem,
} from '../../../core/api-types';
import { AdminDataService } from '../admin-data.service';
import { DrawerNavService } from '../drawer-nav.service';
import { formatDateTime } from '../shared-format';
import { UserStatusSectionComponent } from './user-status.section';
import { RunnerDrawerComponent } from './runner-drawer';
import type { AccountAudience } from './user-status';

const USER = '0b9b7c4e-1111-4222-8333-0000000000aa';
const ME = '0b9b7c4e-1111-4222-8333-0000000000ff';
const REASON = 'Repeated no-shows on paid tasks';

function summary(patch: Partial<AdminUserSummary> = {}): AdminUserSummary {
  return {
    id: USER,
    role: 'runner',
    status: 'active',
    displayName: 'Kevin Otieno',
    phone: '+254712345678',
    ...patch,
  };
}

function item(patch: Partial<UserStatusHistoryItem> = {}): UserStatusHistoryItem {
  return {
    id: 'h1',
    fromStatus: 'active',
    toStatus: 'suspended',
    reason: REASON,
    actorType: 'admin',
    actor: { id: ME, displayName: 'Wanjiru K.' },
    createdAt: '2026-10-28T13:30:00Z',
    ...patch,
  };
}

const isUser =
  (id = USER) =>
  (r: HttpRequest<unknown>) =>
    r.method === 'GET' && r.url === `${API}/admin/users/${id}`;
const isHistory =
  (id = USER) =>
  (r: HttpRequest<unknown>) =>
    r.method === 'GET' && r.url === `${API}/admin/users/${id}/status-history`;
const isPatch = (r: HttpRequest<unknown>) =>
  r.method === 'PATCH' && r.url === `${API}/admin/users/${USER}/status`;

describe('UserStatusSectionComponent (drawer-user-status)', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    http = setupHttpWithAuth();
  });
  afterEach(() => http.verify());

  function create(audience: AccountAudience = 'runner', userId = USER) {
    const fixture = TestBed.createComponent(UserStatusSectionComponent);
    fixture.componentRef.setInput('userId', userId);
    fixture.componentRef.setInput('audience', audience);
    fixture.detectChanges();
    return fixture;
  }

  async function render(
    opts: {
      user?: Partial<AdminUserSummary>;
      items?: UserStatusHistoryItem[];
      nextCursor?: string | null;
      audience?: AccountAudience;
    } = {},
  ) {
    const fixture = create(opts.audience);
    http.expectOne(isUser()).flush(summary(opts.user));
    http
      .expectOne(isHistory())
      .flush({ items: opts.items ?? [], nextCursor: opts.nextCursor ?? null });
    await settle(fixture);
    return fixture;
  }

  async function settle(fixture: { detectChanges: () => void }) {
    await flushAsync();
    fixture.detectChanges();
  }

  const el = (f: { nativeElement: unknown }) => f.nativeElement as HTMLElement;
  const buttons = (f: { nativeElement: unknown }) =>
    Array.from(el(f).querySelectorAll('.drawer-actions button')).map((b) => b.textContent?.trim());
  const button = (f: { nativeElement: unknown }, text: string) =>
    Array.from(el(f).querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === text,
    ) as HTMLButtonElement;
  const sectionNotice = (f: { nativeElement: unknown }) =>
    el(f).querySelector('section > app-inline-notice')?.textContent?.trim() ?? null;

  describe('actions by status (§13.1)', () => {
    const cases: [UserStatus, string[]][] = [
      ['active', ['Suspend runner', 'Ban runner']],
      ['suspended', ['Reactivate runner', 'Ban runner']],
      ['banned', ['Reactivate runner']],
    ];
    for (const [status, expected] of cases) {
      it(`${status} → ${expected.join(' + ')}`, async () => {
        const f = await render({ user: { status } });
        expect(buttons(f)).toEqual(expected);
        expect(buttons(f)).not.toContain(status === 'banned' ? 'Suspend runner' : '');
        for (const b of el(f).querySelectorAll('.drawer-actions button')) {
          expect(b.className).toBe('btn btn-outline');
          expect(b.getAttribute('type')).toBe('button');
        }
      });
    }

    it('uses the customer audience in the labels', async () => {
      const f = await render({
        user: { status: 'suspended', role: 'customer' },
        audience: 'customer',
      });
      expect(buttons(f)).toEqual(['Reactivate customer', 'Ban customer']);
    });
  });

  describe('no actions (§13.2)', () => {
    it('for an admin account, with the explanation', async () => {
      const f = await render({ user: { role: 'admin' } });
      expect(buttons(f)).toEqual([]);
      expect(el(f).querySelector('.drawer-actions')).toBeNull();
      expect(el(f).textContent).toContain("Admin accounts can't be changed here.");
    });

    it('for the signed-in admin (me), before U-1 answers', async () => {
      TestBed.inject(AdminDataService).me.set({ id: USER });
      const f = create();
      expect(el(f).textContent).toContain("You can't change your own account.");
      http.expectOne(isUser()).flush(summary({ role: 'admin' }));
      http.expectOne(isHistory()).flush({ items: [], nextCursor: null });
      await settle(f);
      expect(buttons(f)).toEqual([]);
      expect(el(f).textContent).toContain("You can't change your own account.");
    });

    it('while the status loads, with Loading… in the chip slot', async () => {
      const f = create();
      expect(buttons(f)).toEqual([]);
      expect(el(f).querySelector('.account-status')?.textContent?.trim()).toBe('Loading…');
      http.expectOne(isUser()).flush(summary());
      http.expectOne(isHistory()).flush({ items: [], nextCursor: null });
      await settle(f);
    });

    it('when the status failed to load; Try again reloads it', async () => {
      const f = create();
      http.expectOne(isUser()).flush(null, httpError(500));
      http.expectOne(isHistory()).flush({ items: [item()], nextCursor: null });
      await settle(f);
      expect(buttons(f)).toEqual([]);
      expect(el(f).textContent).toContain("Couldn't load this account's status.");
      // The history still loads.
      expect(el(f).querySelectorAll('.dt-item').length).toBe(1);
      button(f, 'Try again').click();
      http.expectOne(isUser()).flush(summary());
      await settle(f);
      expect(buttons(f)).toEqual(['Suspend runner', 'Ban runner']);
    });
  });

  describe('chip (§13.3)', () => {
    it('shows the account chip from U-1', async () => {
      const f = await render({ user: { status: 'banned' } });
      const chip = el(f).querySelector('.account-status .chip') as HTMLElement;
      expect(chip.textContent?.trim()).toBe('Banned');
      expect(chip.classList).toContain('chip-danger');
    });
  });

  describe('success (§13.7)', () => {
    it('updates the chip from the response, prepends the change and shows the notice', async () => {
      const older = item({ id: 'h0', fromStatus: 'suspended', toStatus: 'active' });
      const f = await render({ items: [older] });
      await act(f, 'Suspend runner');
      const req = http.expectOne(isPatch);
      expect(req.request.body).toEqual({ status: 'suspended', reason: REASON });
      // The chip follows the response, never the requested status.
      req.flush({
        user: { id: USER, role: 'runner', status: 'banned' },
        change: item({ id: 'h2', toStatus: 'banned' }),
      });
      await settle(f);
      expect(el(f).querySelector('[role="dialog"]')).toBeNull();
      expect(el(f).querySelector('.account-status .chip')?.textContent?.trim()).toBe('Banned');
      const lines = Array.from(el(f).querySelectorAll('.dt-item b')).map((b) =>
        b.textContent?.trim(),
      );
      expect(lines).toEqual(['Active → Banned', 'Suspended → Active']);
      expect(sectionNotice(f)).toContain('Account suspended. The runner has been signed out.');
      const notice = el(f).querySelector('section > app-inline-notice [role="status"]');
      expect(notice).not.toBeNull();
      expect(buttons(f)).toEqual(['Reactivate runner']);
      expect(document.activeElement?.classList).toContain('account-status');
    });

    for (const [status, label, text] of [
      ['banned', 'Ban runner', 'Account banned. The runner has been signed out.'],
      ['active', 'Reactivate runner', 'Account reactivated. The runner can sign in again.'],
    ] as const) {
      it(`success notice for ${label}`, async () => {
        const f = await render({ user: { status: status === 'active' ? 'suspended' : 'active' } });
        await act(f, label);
        http.expectOne(isPatch).flush({
          user: { id: USER, role: 'runner', status },
          change: item({ id: 'h9', toStatus: status }),
        });
        await settle(f);
        expect(sectionNotice(f)).toContain(text);
      });
    }
  });

  /** Opens the dialog for `label`, types a reason and confirms. */
  async function act(f: ReturnType<typeof create>, label: string, reason = REASON) {
    button(f, label).click();
    f.detectChanges();
    const textarea = el(f).querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = reason;
    textarea.dispatchEvent(new Event('input'));
    f.detectChanges();
    (el(f).querySelector('.confirm-actions .btn-primary') as HTMLButtonElement).click();
    f.detectChanges();
  }

  describe('notice timer (re-audit m-1)', () => {
    afterEach(() => vi.useRealTimers());

    it('an info notice followed by a success: the success still closes after 6 s', async () => {
      const f = await render();
      // 1. Info notice (409 status_unchanged) and its reload.
      await act(f, 'Suspend runner');
      const body = { statusCode: 409, code: 'status_unchanged', status: 'active' };
      http.expectOne(isPatch).flush(body, httpError(409, body));
      await settle(f);
      expect(sectionNotice(f)).toContain('This account is already Active. Nothing was changed.');
      http.expectOne(isUser()).flush(summary());
      http.expectOne(isHistory()).flush({ items: [], nextCursor: null });
      await settle(f);
      const info = el(f).querySelector('section > app-inline-notice');

      // 2. Success replaces it; from here the clock is fake.
      await act(f, 'Suspend runner');
      vi.useFakeTimers();
      http.expectOne(isPatch).flush({
        user: { id: USER, role: 'runner', status: 'suspended' },
        change: item({ id: 'h5' }),
      });
      for (let i = 0; i < 10; i++) await Promise.resolve();
      f.detectChanges();
      expect(sectionNotice(f)).toContain('Account suspended. The runner has been signed out.');
      // A new notice is a new component, not the info one reused.
      expect(el(f).querySelector('section > app-inline-notice')).not.toBe(info);

      // 3. Auto-close at 6 s.
      vi.advanceTimersByTime(5999);
      f.detectChanges();
      expect(sectionNotice(f)).toContain('Account suspended.');
      vi.advanceTimersByTime(1);
      f.detectChanges();
      expect(sectionNotice(f)).toBeNull();
    });
  });

  describe('section errors (§7, §13.8)', () => {
    it('403 cannot_change_own_status: closes, danger notice, hides the actions', async () => {
      const f = await render();
      await act(f, 'Suspend runner');
      const body = { statusCode: 403, code: 'cannot_change_own_status' };
      http.expectOne(isPatch).flush(body, httpError(403, body));
      await settle(f);
      expect(el(f).querySelector('[role="dialog"]')).toBeNull();
      expect(sectionNotice(f)).toContain("You can't change your own account.");
      expect(el(f).querySelector('section > app-inline-notice [role="alert"]')).not.toBeNull();
      expect(buttons(f)).toEqual([]);
    });

    it('403 cannot_change_admin_status: closes, danger notice, hides the actions', async () => {
      const f = await render();
      await act(f, 'Ban runner');
      const body = { statusCode: 403, code: 'cannot_change_admin_status' };
      http.expectOne(isPatch).flush(body, httpError(403, body));
      await settle(f);
      expect(el(f).querySelector('[role="dialog"]')).toBeNull();
      expect(sectionNotice(f)).toContain("Admin accounts can't be changed here.");
      expect(buttons(f)).toEqual([]);
    });

    it('403 without a code stays in the dialog with FORBIDDEN_COPY', async () => {
      const f = await render();
      await act(f, 'Suspend runner');
      http.expectOne(isPatch).flush({ statusCode: 403 }, httpError(403));
      await settle(f);
      expect(el(f).querySelector('[role="dialog"]')?.textContent).toContain(FORBIDDEN_COPY);
      expect(sectionNotice(f)).toBeNull();
    });

    it('404 user_not_found: closes, hides actions and history', async () => {
      const f = await render({ items: [item()] });
      await act(f, 'Suspend runner');
      const body = { statusCode: 404, code: 'user_not_found' };
      http.expectOne(isPatch).flush(body, httpError(404, body));
      await settle(f);
      expect(el(f).querySelector('[role="dialog"]')).toBeNull();
      expect(sectionNotice(f)).toContain("We couldn't find this account.");
      expect(buttons(f)).toEqual([]);
      expect(el(f).querySelector('.drawer-timeline')).toBeNull();
      expect(el(f).querySelector('.drawer-card:not(.notice)')).toBeNull();
    });

    it('409 status_unchanged: closes, info copy, reloads status and history page 1', async () => {
      const f = await render();
      await act(f, 'Suspend runner');
      const body = { statusCode: 409, code: 'status_unchanged', status: 'suspended' };
      http.expectOne(isPatch).flush(body, httpError(409, body));
      await settle(f);
      expect(el(f).querySelector('[role="dialog"]')).toBeNull();
      expect(sectionNotice(f)).toContain('This account is already Suspended. Nothing was changed.');
      http.expectOne(isUser()).flush(summary({ status: 'suspended' }));
      const page1 = http.expectOne(isHistory());
      expect(page1.request.params.get('cursor')).toBeNull();
      page1.flush({ items: [item()], nextCursor: null });
      await settle(f);
      expect(buttons(f)).toEqual(['Reactivate runner', 'Ban runner']);
      expect(el(f).querySelector('section > app-inline-notice [role="status"]')).not.toBeNull();
    });

    it('409 status_transition_not_allowed: info copy with from/to, reload', async () => {
      const f = await render({ user: { status: 'suspended' } });
      await act(f, 'Reactivate runner');
      const body = {
        statusCode: 409,
        code: 'status_transition_not_allowed',
        from: 'banned',
        to: 'active',
        allowed: ['active'],
      };
      http.expectOne(isPatch).flush(body, httpError(409, body));
      await settle(f);
      expect(sectionNotice(f)).toContain(
        "This account is Banned now, so it can't be reactivated. The latest status is shown.",
      );
      http.expectOne(isUser()).flush(summary({ status: 'banned' }));
      http.expectOne(isHistory()).flush({ items: [], nextCursor: null });
      await settle(f);
      expect(buttons(f)).toEqual(['Reactivate runner']);
    });

    it('status 0 keeps the dialog and the reason', async () => {
      const f = await render();
      await act(f, 'Suspend runner');
      http.expectOne(isPatch).error(new ProgressEvent('error'), { status: 0 });
      await settle(f);
      const dialog = el(f).querySelector('[role="dialog"]') as HTMLElement;
      expect(dialog.textContent).toContain("Couldn't save. Check your connection and try again.");
      expect((el(f).querySelector('textarea') as HTMLTextAreaElement).value).toBe(REASON);
    });

    it('400 status_reason_invalid shows the field error from extra', async () => {
      const f = await render();
      await act(f, 'Suspend runner');
      const body = {
        statusCode: 400,
        code: 'status_reason_invalid',
        minLength: 10,
        maxLength: 500,
      };
      http.expectOne(isPatch).flush(body, httpError(400, body));
      await settle(f);
      expect(el(f).querySelector('.field-error')?.textContent?.trim()).toBe(
        'Enter a reason of 10 to 500 characters.',
      );
    });

    it('400 other shows the generic request copy in the dialog', async () => {
      const f = await render();
      await act(f, 'Suspend runner');
      const body = { statusCode: 400, message: ['id must be a UUID'] };
      http.expectOne(isPatch).flush(body, httpError(400, body));
      await settle(f);
      expect(el(f).querySelector('[role="dialog"]')?.textContent).toContain(
        'Something went wrong with this request. Close the drawer and try again.',
      );
    });
  });

  describe('history (§13.9)', () => {
    it('asks for page 1 with limit=20 and no cursor', () => {
      create();
      http.expectOne(isUser()).flush(summary());
      const req = http.expectOne(isHistory());
      expect(req.request.params.get('limit')).toBe('20');
      expect(req.request.params.has('cursor')).toBe(false);
      req.flush({ items: [], nextCursor: null });
    });

    it('renders items newest first as from → to, actor in .dt-actor, time in .dt-time', async () => {
      const newest = item({
        id: 'h2',
        fromStatus: 'suspended',
        toStatus: 'banned',
        createdAt: '2026-10-28T15:00:00Z',
        reason: 'Fraud confirmed by the merchant. '.repeat(10).trim(),
      });
      const older = item({
        id: 'h1',
        actor: { id: ME, displayName: null },
        createdAt: '2026-10-27T09:00:00Z',
      });
      const system = item({
        id: 'h0',
        fromStatus: 'banned',
        toStatus: 'active',
        actorType: 'system',
        actor: null,
        createdAt: '2026-10-20T09:00:00Z',
      });
      const f = await render({ items: [newest, older, system] });
      const rows = Array.from(el(f).querySelectorAll('.dt-item'));
      expect(rows.map((r) => r.querySelector('b')?.textContent?.trim())).toEqual([
        'Suspended → Banned',
        'Active → Suspended',
        'Banned → Active',
      ]);
      const first = rows[0].querySelectorAll('.dt-time');
      expect(first[0].querySelector('.dt-actor')?.textContent?.trim()).toBe('Admin · Wanjiru K.');
      expect(first[0].textContent).toContain(formatDateTime(newest.createdAt));
      // The reason: full text, Fira Sans (.dt-actor), in quotes.
      expect(first[1].querySelector('.dt-actor')?.textContent?.trim()).toBe(`“${newest.reason}”`);
      expect(rows[1].querySelector('.dt-actor')?.textContent?.trim()).toBe('Admin');
      expect(rows[2].querySelector('.dt-actor')?.textContent?.trim()).toBe('System');
    });

    it('fills Last changed from the newest item, time in Fira Code', async () => {
      const f = await render({ items: [item()] });
      const row = Array.from(el(f).querySelectorAll('.drawer-row')).find((r) =>
        r.textContent?.includes('Last changed'),
      )!;
      expect(row.querySelector('.num')?.textContent?.trim()).toBe(formatDateTime(item().createdAt));
      expect(row.textContent).toContain('Admin · Wanjiru K.');
    });
  });

  describe('history states (§13.10)', () => {
    it('shows Loading history… and — for Last changed while page 1 loads', async () => {
      const f = create();
      expect(el(f).textContent).toContain('Loading history…');
      http.expectOne(isUser()).flush(summary());
      await settle(f);
      const row = Array.from(el(f).querySelectorAll('.drawer-row')).find((r) =>
        r.textContent?.includes('Last changed'),
      )!;
      expect(row.querySelector('b')?.textContent?.trim()).toBe('—');
      http.expectOne(isHistory()).flush({ items: [], nextCursor: null });
      await settle(f);
    });

    it('shows the empty state and No changes recorded', async () => {
      const f = await render();
      expect(el(f).querySelector('.dt-item')?.textContent?.trim()).toBe('No status changes yet.');
      expect(el(f).textContent).toContain('No changes recorded');
    });

    it('shows the error notice and Try again refetches', async () => {
      const f = create();
      http.expectOne(isUser()).flush(summary());
      http.expectOne(isHistory()).flush(null, httpError(503));
      await settle(f);
      expect(el(f).textContent).toContain("Couldn't load the status history.");
      const retry = button(f, 'Try again');
      expect(retry.className).toContain('btn-text');
      retry.click();
      http.expectOne(isHistory()).flush({ items: [item()], nextCursor: null });
      await settle(f);
      expect(el(f).textContent).not.toContain("Couldn't load the status history.");
      expect(el(f).querySelectorAll('.dt-item').length).toBe(1);
    });

    it('Load more appends with the cursor and disappears at the end', async () => {
      const f = await render({ items: [item({ id: 'a' })], nextCursor: 'c1' });
      button(f, 'Load more').click();
      f.detectChanges();
      expect(button(f, 'Loading…').disabled).toBe(true);
      const req = http.expectOne(isHistory());
      expect(req.request.params.get('cursor')).toBe('c1');
      expect(req.request.params.get('limit')).toBe('20');
      req.flush({ items: [item({ id: 'b' })], nextCursor: null });
      await settle(f);
      expect(el(f).querySelectorAll('.dt-item').length).toBe(2);
      expect(button(f, 'Load more')).toBeUndefined();
    });

    it('a failed Load more keeps the loaded items and retries that cursor', async () => {
      const f = await render({ items: [item({ id: 'a' })], nextCursor: 'c1' });
      button(f, 'Load more').click();
      http.expectOne(isHistory()).flush(null, httpError(500));
      await settle(f);
      expect(el(f).querySelectorAll('.dt-item').length).toBe(1);
      button(f, 'Try again').click();
      const req = http.expectOne(isHistory());
      expect(req.request.params.get('cursor')).toBe('c1');
      req.flush({ items: [item({ id: 'b' })], nextCursor: null });
      await settle(f);
      expect(el(f).querySelectorAll('.dt-item').length).toBe(2);
    });

    it('cursor_invalid reloads page 1 silently, once', async () => {
      const f = await render({ items: [item({ id: 'a' })], nextCursor: 'stale' });
      button(f, 'Load more').click();
      const body = { statusCode: 400, code: 'cursor_invalid' };
      http.expectOne(isHistory()).flush(body, httpError(400, body));
      await flushAsync();
      const page1: TestRequest = http.expectOne(isHistory());
      expect(page1.request.params.has('cursor')).toBe(false);
      page1.flush(body, httpError(400, body));
      await settle(f);
      expect(el(f).textContent).toContain("Couldn't load the status history.");
      http.expectNone(isHistory());
    });

    it('cursor_invalid then a good page 1 replaces the list without a notice', async () => {
      const f = await render({ items: [item({ id: 'a' })], nextCursor: 'stale' });
      button(f, 'Load more').click();
      const body = { statusCode: 400, code: 'cursor_invalid' };
      http.expectOne(isHistory()).flush(body, httpError(400, body));
      await flushAsync();
      http.expectOne(isHistory()).flush({ items: [item({ id: 'z' })], nextCursor: null });
      await settle(f);
      expect(el(f).querySelectorAll('.dt-item').length).toBe(1);
      expect(el(f).querySelector('app-inline-notice')).toBeNull();
    });

    it('history 403 shows FORBIDDEN_COPY', async () => {
      const f = create();
      http.expectOne(isUser()).flush(summary());
      http.expectOne(isHistory()).flush({ statusCode: 403 }, httpError(403));
      await settle(f);
      expect(el(f).textContent).toContain(FORBIDDEN_COPY);
    });

    it('history 404 shows the not-found notice and hides the section body', async () => {
      const f = create();
      http.expectOne(isUser()).flush(summary());
      const body = { statusCode: 404, code: 'user_not_found' };
      http.expectOne(isHistory()).flush(body, httpError(404, body));
      await settle(f);
      expect(sectionNotice(f)).toContain("We couldn't find this account.");
      expect(buttons(f)).toEqual([]);
    });
  });

  describe('close guard (§13.11)', () => {
    it('asks Discard this reason? before the drawer closes, then closes on Discard', async () => {
      const nav = TestBed.inject(DrawerNavService);
      nav.current.set({ kind: 'runner', id: 'p1' });
      const f = await render();
      button(f, 'Suspend runner').click();
      f.detectChanges();
      const textarea = el(f).querySelector('textarea') as HTMLTextAreaElement;
      textarea.value = 'Half a reason';
      textarea.dispatchEvent(new Event('input'));
      f.detectChanges();
      nav.requestClose();
      f.detectChanges();
      expect(nav.current()).not.toBeNull();
      expect(el(f).querySelector('h3')?.textContent?.trim()).toBe('Discard this reason?');
      button(f, 'Discard').click();
      f.detectChanges();
      expect(nav.current()).toBeNull();
    });

    it('asks before switching drawers too; Back keeps the drawer and the reason', async () => {
      const nav = TestBed.inject(DrawerNavService);
      nav.current.set({ kind: 'runner', id: 'p1' });
      const f = await render();
      button(f, 'Ban runner').click();
      f.detectChanges();
      const textarea = el(f).querySelector('textarea') as HTMLTextAreaElement;
      textarea.value = 'Half a reason';
      textarea.dispatchEvent(new Event('input'));
      f.detectChanges();
      nav.open('task', 'e1');
      f.detectChanges();
      expect(nav.current()?.kind).toBe('runner');
      button(f, 'Back').click();
      f.detectChanges();
      expect((el(f).querySelector('textarea') as HTMLTextAreaElement).value).toBe('Half a reason');
    });

    it('closes without asking when no reason is typed', async () => {
      const nav = TestBed.inject(DrawerNavService);
      nav.current.set({ kind: 'runner', id: 'p1' });
      const f = await render();
      button(f, 'Suspend runner').click();
      f.detectChanges();
      nav.requestClose();
      expect(nav.current()).toBeNull();
    });
  });
});

describe('runner drawer Account section (§2, §13.6)', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    http = setupHttpWithAuth();
  });
  afterEach(() => http.verify());

  it('targets RunnerListItem.userId, not the profile id, and sits last', async () => {
    const s = TestBed.inject(AdminDataService);
    const runner = {
      id: 'pppppppp-0000-0000-0000-000000000001',
      userId: USER,
      availability: 'online',
      createdAt: '2026-01-01T00:00:00Z',
    } as RunnerListItem;
    s.runners.set([runner]);
    const f = TestBed.createComponent(RunnerDrawerComponent);
    f.componentRef.setInput('runnerId', runner.id);
    f.detectChanges();
    // The section is mounted with @defer (on immediate).
    await f.whenStable();
    f.detectChanges();
    http.expectOne(isUser(USER)).flush(summary());
    http.expectOne(isHistory(USER)).flush({ items: [], nextCursor: null });
    http.expectNone((r) => r.url.includes(runner.id));
    await flushAsync();
    f.detectChanges();
    const host = f.nativeElement as HTMLElement;
    const sections = host.querySelectorAll(':scope > section, :scope > app-user-status-section');
    expect(sections[sections.length - 1].tagName.toLowerCase()).toBe('app-user-status-section');
    const labels = Array.from(host.querySelectorAll('.drawer-actions button')).map((b) =>
      b.textContent?.trim(),
    );
    expect(labels).toContain('Suspend runner');

    (
      Array.from(host.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Suspend runner',
      ) as HTMLButtonElement
    ).click();
    f.detectChanges();
    const textarea = host.querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = REASON;
    textarea.dispatchEvent(new Event('input'));
    f.detectChanges();
    (host.querySelector('.confirm-actions .btn-primary') as HTMLButtonElement).click();
    const req = http.expectOne(isPatch);
    expect(req.request.url).toBe(`${API}/admin/users/${USER}/status`);
    req.flush({ user: { id: USER, role: 'runner', status: 'suspended' }, change: item() });
    await flushAsync();
  });
});

describe('own account from the access token (§13.2)', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    http = setupHttpWithAuth(USER);
  });
  afterEach(() => http.verify());

  it('hides the actions when the target is AuthStore.userId', async () => {
    const f = TestBed.createComponent(UserStatusSectionComponent);
    f.componentRef.setInput('userId', USER);
    f.componentRef.setInput('audience', 'customer');
    f.detectChanges();
    http.expectOne(isUser()).flush(summary({ role: 'customer' }));
    http.expectOne(isHistory()).flush({ items: [], nextCursor: null });
    await flushAsync();
    f.detectChanges();
    const host = f.nativeElement as HTMLElement;
    expect(host.querySelector('.drawer-actions')).toBeNull();
    expect(host.textContent).toContain("You can't change your own account.");
  });
});
