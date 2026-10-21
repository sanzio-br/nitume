import { TestBed } from '@angular/core/testing';
import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { API, flushAsync, httpError, setupHttp } from '../../../testing/admin-test-utils';
import {
  VERIFICATION_STATUS_FILTERS,
  VerificationsPanelComponent,
  awaitingCopy,
  checkRows,
  levelLine,
  nameInitials,
  verificationTypeLabel,
} from './verifications.panel';
import { AdminDataService, timeAgo } from '../admin-data.service';
import { DrawerNavService } from '../drawer-nav.service';
import type {
  RunnerVerification,
  VerificationQueueItem,
  VerificationQueueResult,
} from '../../../core/api-types';

const PROFILE = 'aad1988f-1111-2222-3333-75662a9c0ca7';
const USER = 'bbbbbbbb-1111-2222-3333-000000000001';
const ADMIN = 'adadadad-1111-2222-3333-0000000a0001';
const PROFILE_2 = 'ccccdddd-1111-2222-3333-00000000beef';

const RUNNER = {
  id: PROFILE,
  userId: USER,
  verificationLevel: '1_basic',
  serviceAreas: [
    { id: 'a2', name: 'Westlands' },
    { id: 'a1', name: 'Kilimani' },
  ],
  appliedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
};
const USER_ROW = {
  id: USER,
  phone: '+254712345678',
  displayName: 'Mercy Wanjiru',
  shortName: 'Mercy W.',
};

function check(id: string, patch: Partial<RunnerVerification> = {}): RunnerVerification {
  return {
    id,
    runnerProfileId: PROFILE,
    verificationType: 'government_id',
    side: null,
    status: 'pending',
    reviewerNote: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: '2026-10-20T07:30:00Z',
    purgedAt: null,
    hasDocument: true,
    runnerProfile: RUNNER,
    user: USER_ROW,
    reviewer: null,
    reReviews: [],
    ...patch,
  };
}

/** The API summary: the five required checks, newest record each, `missing` when none. */
function summaryOf(checks: RunnerVerification[]): VerificationQueueItem['verification'] {
  const req = [
    { type: 'phone', side: null },
    { type: 'government_id', side: 'front' },
    { type: 'government_id', side: 'back' },
    { type: 'selfie', side: null },
    { type: 'payment_identity', side: null },
  ] as const;
  const rows = req.map(({ type, side }) => ({
    type,
    side,
    status:
      checks.find((c) => c.verificationType === type && (side === null || c.side === side))
        ?.status ?? ('missing' as const),
  }));
  return { verified: rows.every((r) => r.status === 'approved'), checks: rows };
}

function runner(
  checks: RunnerVerification[],
  patch: Partial<VerificationQueueItem> = {},
): VerificationQueueItem {
  const pending = checks.filter((c) => c.status === 'pending');
  return {
    runnerProfile: RUNNER,
    user: USER_ROW,
    checks,
    pendingCount: pending.length,
    oldestPendingAt: pending.length ? pending[pending.length - 1].createdAt : null,
    verification: summaryOf(checks),
    ...patch,
  };
}

/** The owner's runner (local DB, 2026-10-21): ID front, back, selfie, payment pending + auto-approved phone. */
function ownersChecks(): RunnerVerification[] {
  return [
    check('v-pay', { verificationType: 'payment_identity', hasDocument: false }),
    check('v-selfie', { verificationType: 'selfie' }),
    check('v-back', { side: 'back' }),
    check('v-front', { side: 'front' }),
    check('v-phone', {
      verificationType: 'phone',
      status: 'approved',
      hasDocument: false,
      createdAt: '2026-10-19T07:00:00Z',
    }),
  ];
}

function page(
  items: VerificationQueueItem[],
  patch: Partial<VerificationQueueResult> = {},
): VerificationQueueResult {
  return {
    items,
    nextCursor: null,
    total: items.length,
    awaitingReviewCount: items.filter((i) => i.checks.some((c) => c.status === 'pending')).length,
    ...patch,
  };
}

const queue = (r: { url: string }) => r.url === `${API}/runners/verifications/queue`;

describe('verification labels, rows and copy', () => {
  it('labels every API type, with Front / Back from side', () => {
    expect(verificationTypeLabel({ verificationType: 'government_id', side: 'front' })).toBe(
      'National ID · Front',
    );
    expect(verificationTypeLabel({ verificationType: 'government_id', side: 'back' })).toBe(
      'National ID · Back',
    );
    expect(verificationTypeLabel({ verificationType: 'government_id', side: null })).toBe(
      'National ID',
    );
    expect(verificationTypeLabel({ verificationType: 'selfie' })).toBe('Selfie / liveness check');
    expect(verificationTypeLabel({ verificationType: 'phone' })).toBe('Phone number');
    expect(verificationTypeLabel({ verificationType: 'payment_identity' })).toBe(
      'M-Pesa identity match',
    );
    expect(verificationTypeLabel({ verificationType: 'reference' })).toBe('Reference check');
    expect(verificationTypeLabel({ verificationType: 'business' })).toBe('Business check');
  });

  it('offers All statuses and the API status values', () => {
    expect(VERIFICATION_STATUS_FILTERS.map((f) => f.value)).toEqual([
      'all',
      'pending',
      'approved',
      'rejected',
    ]);
    expect(VERIFICATION_STATUS_FILTERS[0].label).toBe('All statuses');
  });

  it('timeAgo never reads NaN', () => {
    expect(timeAgo(undefined)).toBe('—');
    expect(timeAgo('not a date')).toBe('—');
  });

  it('takes initials from the display name, never an id', () => {
    expect(nameInitials('Mercy Wanjiru')).toBe('MW');
    expect(nameInitials('  mercy  akinyi wanjiru ')).toBe('MW');
    expect(nameInitials('Mercy')).toBe('M');
    expect(nameInitials(null)).toBe('R');
    expect(nameInitials('   ')).toBe('R');
  });

  it('counts applications, not checks', () => {
    expect(awaitingCopy(0)).toBe('No applications awaiting review');
    expect(awaitingCopy(1)).toBe('1 application awaiting review');
    expect(awaitingCopy(14)).toBe('14 applications awaiting review');
  });

  it('builds the rows in mockup order from the newest record of each check', () => {
    const rows = checkRows(
      runner([
        check('v-front-new', { side: 'front', createdAt: '2026-10-21T07:00:00Z' }),
        ...ownersChecks().map((c) =>
          c.id === 'v-front' ? { ...c, status: 'rejected' as const } : c,
        ),
        check('v-legacy', { side: null, status: 'rejected', createdAt: '2026-09-01T07:00:00Z' }),
      ]),
    );
    expect(rows.map((r) => r.label)).toEqual([
      'National ID · Front',
      'National ID · Back',
      'National ID',
      'Phone number',
      'Selfie / liveness check',
      'M-Pesa identity match',
    ]);
    expect(rows[0].record?.id).toBe('v-front-new');
    expect(rows[0].status).toBe('pending');
    expect(rows.find((r) => r.label === 'Phone number')?.compact).toBe(true);
  });

  it('shows a required check with no record as Not submitted', () => {
    const rows = checkRows(runner([check('v-front', { side: 'front' })]));
    expect(rows.find((r) => r.label === 'National ID · Back')).toMatchObject({
      status: 'missing',
      record: null,
    });
  });

  it('writes the level line from the API level only', () => {
    const text = (parts: ReturnType<typeof levelLine>) => parts?.map((p) => p.text).join('');
    const rows = checkRows(runner(ownersChecks()));
    expect(text(levelLine('1_basic', rows))).toBe(
      'Level 1 — Basic · Level 2 needs: ID front, ID back, selfie',
    );
    expect(
      levelLine('1_basic', rows)
        ?.filter((p) => p.num)
        .map((p) => p.text),
    ).toEqual(['1', '2']);
    const approved = checkRows(
      runner(
        ownersChecks().map((c) =>
          c.verificationType === 'payment_identity' ? c : { ...c, status: 'approved' as const },
        ),
      ),
    );
    // All three approved but the API still says Level 1: the level only, never inferred.
    expect(text(levelLine('1_basic', approved))).toBe('Level 1 — Basic');
    expect(text(levelLine('2_id_verified', rows))).toBe('Level 2 — ID verified');
    expect(levelLine(undefined, rows)).toBeNull();
  });
});

describe('VerificationsPanelComponent', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    http = setupHttp();
  });
  afterEach(() => http.verify());

  async function render(
    items: VerificationQueueItem[] = [runner(ownersChecks())],
    patch: Partial<VerificationQueueResult> = {},
  ) {
    const fixture = TestBed.createComponent(VerificationsPanelComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Loading…');
    expect(el.textContent).not.toContain('No applications match');
    const req = http.expectOne(queue);
    expect(req.request.params.get('status')).toBe('pending');
    expect(req.request.params.get('limit')).toBe('20');
    req.flush(page(items, patch));
    await flushAsync();
    fixture.detectChanges();
    return { fixture, el };
  }

  async function settle(fixture: { detectChanges(): void }) {
    await flushAsync();
    fixture.detectChanges();
  }

  /** The doc-row of a check and the detail block under it. */
  function row(el: HTMLElement, label: string): { head: HTMLElement; detail: HTMLElement | null } {
    const head = Array.from(el.querySelectorAll<HTMLElement>('.doc-row')).find(
      (r) => r.firstElementChild?.textContent?.trim() === label,
    );
    if (!head) throw new Error(`no row ${label}`);
    const next = head.nextElementSibling as HTMLElement | null;
    return { head, detail: next?.classList.contains('doc-detail') ? next : null };
  }

  function detail(el: HTMLElement, label: string): HTMLElement {
    const d = row(el, label).detail;
    if (!d) throw new Error(`no detail under ${label}`);
    return d;
  }

  function button(root: HTMLElement, text: string): HTMLButtonElement {
    const found = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent?.trim() === text,
    );
    if (!found) throw new Error(`no button ${text}`);
    return found;
  }

  function dialog(el: HTMLElement): HTMLElement {
    const d = el.querySelector<HTMLElement>('[role="dialog"]');
    if (!d) throw new Error('no dialog');
    return d;
  }

  function type(fixture: { detectChanges(): void }, area: HTMLTextAreaElement, value: string) {
    area.value = value;
    area.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it("renders the owner's runner as one card with four actionable rows and a compact phone row", async () => {
    const { el } = await render();
    const text = el.textContent ?? '';
    expect(el.querySelector('h1')?.textContent).toBe('Runner verification');
    expect(el.querySelector('.ops-topbar .sub')?.textContent).toBe('1 application awaiting review');
    expect(el.querySelectorAll('.verif-card').length).toBe(1);
    expect(el.querySelectorAll('.doc-row').length).toBe(5);
    expect(el.querySelectorAll('.btn-approve').length).toBe(4);
    expect(el.querySelectorAll('.btn-reject').length).toBe(4);
    // Mockup classes only: no unstyled vc-* markup, no runner-avatar, no primary on the card.
    expect(el.querySelector('[class*="vc-"]')).toBeNull();
    expect(el.querySelector('.runner-avatar')).toBeNull();
    expect(el.querySelector('.verif-card .btn-primary')).toBeNull();
    expect(el.querySelector('app-status-chip')).toBeNull();

    // Header.
    const avatar = el.querySelector('.verif-avatar')!;
    expect(avatar.textContent?.trim()).toBe('MW');
    expect(avatar.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('.verif-name')?.textContent).toBe('Mercy W.');
    const subs = Array.from(el.querySelectorAll('.verif-sub')).map((s) => s.textContent);
    expect(subs).toEqual(['Applied 2d ago · Kilimani +1', '#NT-C0CA7 · +254 712 345 678']);
    expect(el.querySelector('.verif-level')?.textContent).toBe(
      'Level 1 — Basic · Level 2 needs: ID front, ID back, selfie',
    );
    expect(el.querySelector('.verif-level .num')?.textContent).toBe('1');
    const section = el.querySelector('section.verif-card')!;
    expect(el.querySelector(`#${section.getAttribute('aria-labelledby')}`)?.textContent).toBe(
      'Mercy W.',
    );

    // Rows.
    for (const label of [
      'National ID · Front',
      'National ID · Back',
      'Selfie / liveness check',
      'M-Pesa identity match',
    ]) {
      expect(row(el, label).head.querySelector('.doc-status.pending')?.textContent).toBe(
        'Pending review',
      );
      expect(detail(el, label).querySelector('.btn-approve')).toBeTruthy();
    }
    const phone = row(el, 'Phone number');
    expect(phone.head.querySelector('.doc-status')?.textContent).toBe('Verified');
    expect(phone.detail?.textContent?.trim()).toBe('Verified at sign-in');
    expect(phone.detail?.querySelector('button')).toBeNull();

    // Details: Submitted in Fira Code, image button never a link, M-Pesa has no image line.
    const front = detail(el, 'National ID · Front');
    expect(front.querySelector('.drawer-row b')?.textContent).toContain('10:30 AM');
    expect(front.querySelector('a[href]')).toBeNull();
    expect(button(front, 'View image').getAttribute('aria-label')).toBe(
      'View National ID · Front image for Mercy W., opens in a new tab',
    );
    expect(button(front, 'View image').className).toBe('btn btn-text btn-sm');
    expect(detail(el, 'M-Pesa identity match').textContent).not.toContain('Image');
    expect(button(front, 'Approve').getAttribute('aria-label')).toBe(
      'Approve National ID · Front for Mercy W.',
    );
    expect(button(front, 'Reject').getAttribute('aria-label')).toBe(
      'Reject National ID · Front for Mercy W.',
    );

    expect(text).not.toContain('NaN');
    expect(text).not.toContain('runner level upgrades');
    expect(text).toContain(
      'Opening an image is logged. Images are deleted at the end of the retention period. A runner reaches Level 2 when both ID sides and the selfie are approved.',
    );
  });

  it('falls back to R and the short id when the runner has no name', async () => {
    const { el } = await render([
      runner(ownersChecks(), {
        user: { id: USER, phone: '+254712345678', displayName: null, shortName: null },
        runnerProfile: { ...RUNNER, serviceAreas: [] },
      }),
    ]);
    expect(el.querySelector('.verif-avatar')?.textContent?.trim()).toBe('R');
    const name = el.querySelector('.verif-name')!;
    expect(name.textContent).toBe('#NT-C0CA7');
    expect(name.classList.contains('num')).toBe(true);
    const subs = Array.from(el.querySelectorAll('.verif-sub')).map((s) => s.textContent);
    expect(subs).toEqual(['Applied 2d ago', '+254 712 345 678']);
  });

  it('opens the runner drawer from the card header', async () => {
    const { el } = await render();
    const header = el.querySelector<HTMLButtonElement>('button.verif-top')!;
    expect(header.getAttribute('aria-label')).toBe('Open runner Mercy W.');
    header.click();
    expect(TestBed.inject(DrawerNavService).current()).toEqual({ kind: 'runner', id: PROFILE });
  });

  it('approves one row through the three-segment path and reflects the new level', async () => {
    const { fixture, el } = await render();
    button(detail(el, 'Selfie / liveness check'), 'Approve').click();
    fixture.detectChanges();
    // Only that row is busy; the others stay usable.
    expect(button(detail(el, 'Selfie / liveness check'), 'Approving…').disabled).toBe(true);
    expect(button(detail(el, 'Selfie / liveness check'), 'Reject').disabled).toBe(true);
    expect(button(detail(el, 'National ID · Front'), 'Approve').disabled).toBe(false);
    const req = http.expectOne(`${API}/runners/${PROFILE}/verifications/v-selfie`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ decision: 'approved' });
    req.flush(
      check('v-selfie', {
        verificationType: 'selfie',
        status: 'approved',
        reviewedBy: ADMIN,
        reviewedAt: '2026-10-21T08:00:00Z',
        reviewer: { id: ADMIN, displayName: 'Grace A.' },
        runnerProfile: { ...RUNNER, verificationLevel: '2_id_verified' },
      }),
    );
    await settle(fixture);
    expect(el.textContent).toContain('Check approved.');
    expect(row(el, 'Selfie / liveness check').head.textContent).toContain('Verified');
    expect(detail(el, 'Selfie / liveness check').textContent).toContain(
      'Decided · Approved · Grace A.',
    );
    expect(el.querySelector('.verif-level')?.textContent).toBe('Level 2 — ID verified');
    // Other pending rows remain, so the runner still awaits review.
    expect(el.querySelector('.ops-topbar .sub')?.textContent).toBe('1 application awaiting review');
  });

  it('merges side, hasDocument and purgedAt from a full answer and keeps the runner on a bare one', async () => {
    const { fixture, el } = await render();
    button(detail(el, 'National ID · Front'), 'Approve').click();
    http.expectOne(`${API}/runners/${PROFILE}/verifications/v-front`).flush(
      check('v-front', {
        side: 'front',
        status: 'approved',
        reviewedBy: ADMIN,
        reviewedAt: '2026-10-21T08:00:00Z',
        hasDocument: false,
      }),
    );
    await settle(fixture);
    expect(detail(el, 'National ID · Front').textContent).toContain('No image on file');

    button(detail(el, 'National ID · Back'), 'Approve').click();
    const {
      runnerProfile: _p,
      user: _u,
      reviewer: _r,
      reReviews: _rr,
      ...bare
    } = check('v-back', { side: 'back' });
    http.expectOne(`${API}/runners/${PROFILE}/verifications/v-back`).flush({
      ...bare,
      status: 'approved',
      reviewedBy: ADMIN,
      reviewedAt: '2026-10-21T08:00:00Z',
    });
    await settle(fixture);
    const card = TestBed.inject(AdminDataService).verificationQueue()[0];
    const back = card.checks.find((c) => c.id === 'v-back')!;
    expect(back.status).toBe('approved');
    expect(back.user?.phone).toBe('+254712345678');
    expect(back.reviewer).toEqual({ id: ADMIN, displayName: null });
    expect(el.querySelector('.verif-name')?.textContent).toBe('Mercy W.');
    expect(detail(el, 'National ID · Back').textContent).toContain('Decided · Approved · #NT-');
  });

  it('drops the topbar count when the runner has no pending check left, and keeps the card', async () => {
    const checks = ownersChecks().map((c) =>
      c.id === 'v-pay' ? c : { ...c, status: 'approved' as const },
    );
    const { fixture, el } = await render([runner(checks)], { awaitingReviewCount: 3 });
    expect(el.querySelector('.ops-topbar .sub')?.textContent).toBe(
      '3 applications awaiting review',
    );
    button(detail(el, 'M-Pesa identity match'), 'Approve').click();
    http
      .expectOne(`${API}/runners/${PROFILE}/verifications/v-pay`)
      .flush(check('v-pay', { verificationType: 'payment_identity', status: 'approved' }));
    await settle(fixture);
    expect(el.querySelector('.ops-topbar .sub')?.textContent).toBe(
      '2 applications awaiting review',
    );
    expect(el.querySelectorAll('.verif-card').length).toBe(1);
  });

  it('rejects through the dialog with a trimmed internal note', async () => {
    const { fixture, el } = await render();
    button(detail(el, 'National ID · Back'), 'Reject').click();
    fixture.detectChanges();
    const d = dialog(el);
    expect(d.querySelector('h3')?.textContent).toBe('Reject National ID · Back?');
    expect(d.textContent?.replace(/\s+/g, ' ')).toContain(
      "Mercy W. will see that this check wasn't approved and can submit it again. Your note stays internal and is never shown to the runner.",
    );
    expect(d.textContent).toContain('Note (optional)');
    expect(d.textContent).toContain('Internal. Never shown to the runner.');
    expect(d.querySelector('.field-counter')?.textContent).toBe('0/500');
    const area = d.querySelector('textarea') as HTMLTextAreaElement;
    expect(area.getAttribute('maxlength')).toBe('500');
    type(fixture, area, '  Blurry photo  ');
    expect(d.querySelector('.field-counter')?.textContent).toBe('12/500');
    button(d, 'Reject check').click();
    fixture.detectChanges();
    expect(button(dialog(el), 'Rejecting…').disabled).toBe(true);
    expect(button(dialog(el), 'Back').disabled).toBe(true);
    const req = http.expectOne(`${API}/runners/${PROFILE}/verifications/v-back`);
    expect(req.request.body).toEqual({ decision: 'rejected', reviewerNote: 'Blurry photo' });
    req.flush(
      check('v-back', {
        side: 'back',
        status: 'rejected',
        reviewerNote: 'Blurry photo',
        reviewedBy: ADMIN,
        reviewedAt: '2026-10-21T08:00:00Z',
        reviewer: { id: ADMIN, displayName: 'Grace A.' },
      }),
    );
    await settle(fixture);
    expect(el.querySelector('[role="dialog"]')).toBeNull();
    expect(el.textContent).toContain('Check rejected.');
    expect(
      row(el, 'National ID · Back').head.querySelector('.doc-status.rejected')?.textContent,
    ).toBe('Rejected');
    const back = detail(el, 'National ID · Back');
    expect(back.textContent).toContain('Admin note');
    expect(back.textContent).toContain('Blurry photo · internal');
    expect(button(back, 'Re-review evidence').className).toBe('btn btn-outline btn-sm');
  });

  it('sends a blank reject note as no note', async () => {
    const { fixture, el } = await render();
    button(detail(el, 'Selfie / liveness check'), 'Reject').click();
    fixture.detectChanges();
    type(fixture, dialog(el).querySelector('textarea') as HTMLTextAreaElement, '    ');
    button(dialog(el), 'Reject check').click();
    const req = http.expectOne(`${API}/runners/${PROFILE}/verifications/v-selfie`);
    expect(req.request.body).toEqual({ decision: 'rejected' });
    req.flush(check('v-selfie', { verificationType: 'selfie', status: 'rejected' }));
    await settle(fixture);
    expect(el.textContent).not.toContain('Admin note');
  });

  it('keeps the dialog and the note on a note error or a failed save', async () => {
    const { fixture, el } = await render();
    button(detail(el, 'Selfie / liveness check'), 'Reject').click();
    fixture.detectChanges();
    type(fixture, dialog(el).querySelector('textarea') as HTMLTextAreaElement, 'Too long?');
    button(dialog(el), 'Reject check').click();
    http
      .expectOne(`${API}/runners/${PROFILE}/verifications/v-selfie`)
      .flush({ code: 'reviewer_note_invalid', maxLength: 500 }, httpError(400));
    await settle(fixture);
    expect(dialog(el).textContent).toContain('Notes can be up to 500 characters.');
    expect((dialog(el).querySelector('textarea') as HTMLTextAreaElement).value).toBe('Too long?');

    button(dialog(el), 'Reject check').click();
    http.expectOne(`${API}/runners/${PROFILE}/verifications/v-selfie`).flush(null, httpError(500));
    await settle(fixture);
    expect(dialog(el).textContent).toContain("Couldn't save the review. Try again.");
  });

  it('reloads with a notice when the check was already decided (404 or 409)', async () => {
    for (const status of [404, 409]) {
      const { fixture, el } = await render();
      button(detail(el, 'Selfie / liveness check'), 'Approve').click();
      http
        .expectOne(`${API}/runners/${PROFILE}/verifications/v-selfie`)
        .flush(
          status === 409 ? { code: 'verification_already_decided', status: 'approved' } : null,
          httpError(status),
        );
      await flushAsync();
      http.expectOne(queue).flush(page([runner(ownersChecks())]));
      await settle(fixture);
      expect(el.textContent).toContain('This check was already decided. The list is updated.');
      fixture.destroy();
      TestBed.inject(AdminDataService).verificationQueue.set([]);
    }
  });

  it('closes the reject dialog and reloads on a 409', async () => {
    const { fixture, el } = await render();
    button(detail(el, 'National ID · Front'), 'Reject').click();
    fixture.detectChanges();
    button(dialog(el), 'Reject check').click();
    http
      .expectOne(`${API}/runners/${PROFILE}/verifications/v-front`)
      .flush({ code: 'verification_already_decided', status: 'rejected' }, httpError(409));
    await flushAsync();
    http.expectOne(queue).flush(page([runner(ownersChecks())]));
    await settle(fixture);
    expect(el.querySelector('[role="dialog"]')).toBeNull();
    expect(el.textContent).toContain('This check was already decided. The list is updated.');
  });

  describe('View image', () => {
    function fakeTab() {
      return {
        opener: {} as unknown,
        location: { replace: vi.fn() },
        close: vi.fn(),
      };
    }

    it('opens a tab on the click, then points it at a fresh signed link', async () => {
      const tab = fakeTab();
      const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
      const { fixture, el } = await render();
      http.expectNone(`${API}/runners/verifications/v-front/document`);
      button(detail(el, 'National ID · Front'), 'View image').click();
      // Synchronously on the click, before any await (no popup blocker).
      expect(open).toHaveBeenCalledWith('', '_blank');
      expect(tab.opener).toBeNull();
      fixture.detectChanges();
      expect(button(detail(el, 'National ID · Front'), 'Opening…').disabled).toBe(true);
      http.expectOne(`${API}/runners/verifications/v-front/document`).flush({
        verificationId: 'v-front',
        url: 'https://signed.example/img',
        expiresAt: '2026-10-21T08:05:00Z',
      });
      await flushAsync();
      expect(tab.location.replace).toHaveBeenCalledWith('https://signed.example/img');
      expect(tab.close).not.toHaveBeenCalled();
      expect(open).toHaveBeenCalledTimes(1);
      open.mockRestore();
    });

    it('closes the tab when there is nothing to show', async () => {
      const tab = fakeTab();
      const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
      const { fixture, el } = await render();
      button(detail(el, 'National ID · Front'), 'View image').click();
      http
        .expectOne(`${API}/runners/verifications/v-front/document`)
        .flush({ verificationId: 'v-front', url: null, expiresAt: null });
      await settle(fixture);
      expect(tab.close).toHaveBeenCalledTimes(1);
      expect(el.textContent).toContain("Image preview isn't available in this environment.");

      const tab2 = fakeTab();
      open.mockReturnValue(tab2 as unknown as Window);
      button(detail(el, 'National ID · Front'), 'View image').click();
      http.expectOne(`${API}/runners/verifications/v-front/document`).flush(null, httpError(500));
      await settle(fixture);
      expect(tab2.close).toHaveBeenCalledTimes(1);
      expect(tab2.location.replace).not.toHaveBeenCalled();
      expect(el.textContent).toContain("Couldn't open the image. Try again.");
      open.mockRestore();
    });

    it('falls back to a direct open when the blank tab was blocked', async () => {
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      const { el } = await render();
      button(detail(el, 'National ID · Front'), 'View image').click();
      http.expectOne(`${API}/runners/verifications/v-front/document`).flush({
        verificationId: 'v-front',
        url: 'https://signed.example/img',
        expiresAt: '2026-10-21T08:05:00Z',
      });
      await flushAsync();
      expect(open).toHaveBeenLastCalledWith(
        'https://signed.example/img',
        '_blank',
        'noopener,noreferrer',
      );
      open.mockRestore();
    });

    it('switches to Deleted on a 410 (date from the API only) and to No image when missing', async () => {
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      const { fixture, el } = await render();
      button(detail(el, 'National ID · Back'), 'View image').click();
      http
        .expectOne(`${API}/runners/verifications/v-back/document`)
        .flush(
          { code: 'verification_document_purged', purgedAt: '2026-10-21T05:00:00Z' },
          httpError(410),
        );
      await settle(fixture);
      const back = detail(el, 'National ID · Back');
      expect(back.textContent).toContain('Deleted');
      expect(back.querySelector('.val-muted .num')?.textContent).toContain('8:00 AM');
      expect(el.textContent).toContain(
        'This image was deleted at the end of the retention period.',
      );

      // 410 without `purgedAt`: `Deleted`, no date (never today's).
      button(detail(el, 'National ID · Front'), 'View image').click();
      http
        .expectOne(`${API}/runners/verifications/v-front/document`)
        .flush({ code: 'verification_document_purged' }, httpError(410));
      await settle(fixture);
      const front = detail(el, 'National ID · Front');
      expect(front.textContent).toContain('Deleted at the end of the retention period.');
      expect(front.querySelector('.val-muted')?.textContent?.trim()).toBe('Deleted');
      expect(front.textContent).not.toContain('View image');

      button(detail(el, 'Selfie / liveness check'), 'View image').click();
      http
        .expectOne(`${API}/runners/verifications/v-selfie/document`)
        .flush({ code: 'verification_document_missing' }, httpError(404));
      await settle(fixture);
      expect(detail(el, 'Selfie / liveness check').textContent).toContain('No image on file');
      expect(el.textContent).toContain('No image is stored for this check.');
      open.mockRestore();
    });
  });

  it('hides the admin note on a purged check', async () => {
    const { el } = await render([
      runner([
        check('v1', {
          side: 'front',
          status: 'approved',
          reviewerNote: 'Matches',
          reviewedAt: '2026-10-20T08:00:00Z',
          reviewedBy: ADMIN,
          purgedAt: '2026-10-21T05:00:00Z',
        }),
      ]),
    ]);
    expect(el.textContent).not.toContain('Admin note');
    expect(el.textContent).not.toContain('Re-review evidence');
  });

  it('records a re-review with a trimmed optional note and lists it', async () => {
    const { fixture, el } = await render([
      runner([
        check('v1', {
          side: 'front',
          status: 'approved',
          reviewedAt: '2026-10-20T08:00:00Z',
          reviewedBy: ADMIN,
          reviewer: { id: ADMIN, displayName: 'Grace A.' },
        }),
      ]),
    ]);
    expect(el.textContent).toContain('Decided · Approved · Grace A.');
    button(el, 'Re-review evidence').click();
    fixture.detectChanges();
    expect(el.textContent).toContain('Re-review this evidence?');
    expect(dialog(el).textContent?.replace(/\s+/g, ' ')).toContain(
      'the stored National ID · Front for Mercy W. again',
    );
    expect(dialog(el).querySelector('.field-counter')?.textContent).toBe('0/500');
    type(fixture, dialog(el).querySelector('textarea') as HTMLTextAreaElement, '  Second look  ');
    button(el, 'Record re-review').click();
    fixture.detectChanges();
    const req = http.expectOne(`${API}/runners/verifications/v1/re-review`);
    expect(req.request.body).toEqual({ note: 'Second look' });
    req.flush({
      verificationId: 'v1',
      reReview: {
        id: 'rr1',
        reviewedBy: { id: ADMIN, displayName: 'Grace A.' },
        createdAt: '2026-10-21T09:00:00Z',
        note: 'Second look',
      },
    });
    await settle(fixture);
    expect(el.textContent).toContain('Re-review recorded.');
    expect(el.textContent).toContain('Re-reviewed · Grace A.');
    expect(el.textContent).toContain('Second look');
    expect(el.textContent).not.toContain('Re-review this evidence?');
  });

  it('sends a blank re-review note as no note and handles 409', async () => {
    const { fixture, el } = await render([
      runner([
        check('v1', {
          side: 'back',
          status: 'rejected',
          reviewedAt: '2026-10-20T08:00:00Z',
          reviewedBy: ADMIN,
        }),
      ]),
    ]);
    button(el, 'Re-review evidence').click();
    fixture.detectChanges();
    type(fixture, dialog(el).querySelector('textarea') as HTMLTextAreaElement, '   ');
    button(el, 'Record re-review').click();
    const req = http.expectOne(`${API}/runners/verifications/v1/re-review`);
    expect(req.request.body).toEqual({});
    req.flush({ code: 'verification_not_decided' }, httpError(409));
    await flushAsync();
    http.expectOne(queue).flush(page([]));
    await settle(fixture);
    expect(el.textContent).toContain('Decide this check first.');
  });

  it('filters by runner status and clears the cards when a load fails', async () => {
    const { fixture, el } = await render();
    const select = el.querySelector('select') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual([
      'all',
      'pending',
      'approved',
      'rejected',
    ]);
    expect(select.value).toBe('pending');
    select.value = 'approved';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    // No cards from the previous filter under the new one.
    expect(el.querySelectorAll('.verif-card').length).toBe(0);
    const req: TestRequest = http.expectOne(queue);
    expect(req.request.params.get('status')).toBe('approved');
    req.flush(null, httpError(500));
    await settle(fixture);
    expect(el.textContent).toContain("Couldn't load verifications. Try again.");
    expect(el.querySelectorAll('.verif-card').length).toBe(0);
    expect(el.textContent).not.toContain('No applications match');
    expect(el.querySelector('app-load-more')).toBeNull();

    button(el, '↻ Refresh').click();
    http.expectOne(queue).flush(page([], { awaitingReviewCount: 0 }));
    await settle(fixture);
    // The load-error notice belongs to the failed load, not the empty state after it.
    expect(el.textContent).not.toContain("Couldn't load verifications. Try again.");
    expect(el.querySelector('.panel-notice')).toBeNull();
    expect(el.textContent).toContain('No applications match');
    expect(el.textContent).toContain('Clear the filter, or wait for runner submissions.');
    expect(el.querySelector('.ops-topbar .sub')?.textContent).toBe(
      'No applications awaiting review',
    );
  });

  it('clears the cards when a refresh fails', async () => {
    const { fixture, el } = await render();
    button(el, '↻ Refresh').click();
    http.expectOne(queue).flush(null, httpError(500));
    await settle(fixture);
    expect(el.querySelectorAll('.verif-card').length).toBe(0);
    expect(el.textContent).not.toContain('No applications match');
  });

  it('drops the load-error notice when the next load starts (refresh, then filter change)', async () => {
    const { fixture, el } = await render();
    button(el, '↻ Refresh').click();
    http.expectOne(queue).flush(null, httpError(500));
    await settle(fixture);
    expect(el.textContent).toContain("Couldn't load verifications. Try again.");

    button(el, '↻ Refresh').click();
    fixture.detectChanges();
    expect(el.textContent).not.toContain("Couldn't load verifications. Try again.");
    http.expectOne(queue).flush(page([runner(ownersChecks())]));
    await settle(fixture);
    expect(el.querySelectorAll('.verif-card').length).toBe(1);
    expect(el.querySelector('.panel-notice')).toBeNull();

    // Fail again, then a filter change that succeeds.
    button(el, '↻ Refresh').click();
    http.expectOne(queue).flush(null, httpError(500));
    await settle(fixture);
    expect(el.textContent).toContain("Couldn't load verifications. Try again.");
    const select = el.querySelector('select') as HTMLSelectElement;
    select.value = 'all';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    http.expectOne(queue).flush(page([runner(ownersChecks())]));
    await settle(fixture);
    expect(el.querySelectorAll('.verif-card').length).toBe(1);
    expect(el.querySelector('.panel-notice')).toBeNull();
  });

  it('keeps a save-error notice across a reload', async () => {
    const { fixture, el } = await render();
    button(detail(el, 'Selfie / liveness check'), 'Approve').click();
    http.expectOne(`${API}/runners/${PROFILE}/verifications/v-selfie`).flush(null, httpError(500));
    await settle(fixture);
    expect(el.textContent).toContain("Couldn't save the review. Try again.");
    button(el, '↻ Refresh').click();
    http.expectOne(queue).flush(page([runner(ownersChecks())]));
    await settle(fixture);
    expect(el.textContent).toContain("Couldn't save the review. Try again.");
  });

  it('loads more by runner, merging a runner already on screen into its card', async () => {
    const other = runner(
      [
        check('w-front', {
          runnerProfileId: PROFILE_2,
          side: 'front',
          runnerProfile: { ...RUNNER, id: PROFILE_2 },
        }),
      ],
      {
        runnerProfile: { ...RUNNER, id: PROFILE_2 },
        user: { id: 'u2', phone: null, displayName: 'Dennis Kamau', shortName: 'Dennis K.' },
      },
    );
    const { fixture, el } = await render([runner(ownersChecks().slice(0, 2))], {
      nextCursor: 'c1',
    });
    expect(el.querySelectorAll('.verif-card').length).toBe(1);
    button(el, 'Load more').click();
    const req = http.expectOne(queue);
    expect(req.request.params.get('cursor')).toBe('c1');
    req.flush(page([runner(ownersChecks().slice(2)), other], { nextCursor: 'c2' }));
    await settle(fixture);
    expect(el.querySelectorAll('.verif-card').length).toBe(2);
    expect(el.querySelectorAll('.verif-card')[0].querySelectorAll('.btn-approve').length).toBe(4);

    // A failed Load more keeps the cards and the button.
    button(el, 'Load more').click();
    http.expectOne(queue).flush(null, httpError(500));
    await settle(fixture);
    expect(el.querySelectorAll('.verif-card').length).toBe(2);
    expect(el.textContent).toContain("Couldn't load verifications. Try again.");
    expect(button(el, 'Load more')).toBeTruthy();

    // Retrying Load more drops the old load-error notice.
    button(el, 'Load more').click();
    http.expectOne(queue).flush(page([], { nextCursor: null }));
    await settle(fixture);
    expect(el.textContent).not.toContain("Couldn't load verifications. Try again.");
  });
});
