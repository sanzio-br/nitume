import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { API, flushAsync, httpError, setupHttp } from '../../../testing/admin-test-utils';
import {
  ADMIN,
  PROFILE,
  RUNNER,
  USER,
  check,
  documentUrl,
  isDocument,
  ownersChecks,
  runner,
  runnerUrl,
} from '../../../testing/verification-fixtures';
import { RunnerVerificationDrawerComponent } from './runner-verification-drawer';
import { AdminDataService } from '../admin-data.service';
import { DrawerNavService } from '../drawer-nav.service';
import { FORBIDDEN_COPY } from '../../../core/api-error';
import type { RunnerVerification, VerificationQueueItem } from '../../../core/api-types';

/** Mounts the drawer the way the shell does (removed from the DOM on close). */
@Component({
  imports: [RunnerVerificationDrawerComponent],
  template: `@if (show()) {
    <app-runner-verification-drawer [runnerProfileId]="id" />
  }`,
})
class HostComponent {
  readonly show = signal(true);
  readonly id = PROFILE;
}

const SIGNED = (id: string) => `https://signed.example/${id}`;
const inFiveMinutes = () => new Date(Date.now() + 300_000).toISOString();
const expired = () => new Date(Date.now() - 1_000).toISOString();

describe('RunnerVerificationDrawerComponent', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    http = setupHttp();
  });
  afterEach(() => {
    http.verify();
    document.querySelectorAll('app-image-viewer').forEach((v) => v.remove());
  });

  type Fixture = ComponentFixture<HostComponent>;

  function mount(): Fixture {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture;
  }

  /** Closes the drawer: the component and its DOM go, as in the shell. */
  function close(fixture: Fixture) {
    fixture.componentInstance.show.set(false);
    fixture.detectChanges();
  }

  async function settle(fixture: Fixture) {
    await flushAsync();
    fixture.detectChanges();
  }

  /** Flushes every pending document call with a link (or a given answer). */
  function flushDocs(answer: 'link' | 'null' = 'link', expiresAt = inFiveMinutes()): string[] {
    return http.match(isDocument).map((req) => {
      const id = req.request.url.split('/').slice(-2)[0];
      req.flush({
        verificationId: id,
        url: answer === 'link' ? SIGNED(id) : null,
        expiresAt: answer === 'link' ? expiresAt : null,
      });
      return id;
    });
  }

  /**
   * Opens the drawer the way the table does: the runner is in the store,
   * then AV-1 refreshes it. Image calls are left pending unless `docs`.
   */
  async function open(
    item: VerificationQueueItem = runner(ownersChecks()),
    opts: { inStore?: boolean; av1?: VerificationQueueItem | number; docs?: boolean } = {},
  ) {
    const s = TestBed.inject(AdminDataService);
    if (opts.inStore !== false) {
      s.verificationQueue.set([item]);
      s.awaitingReviewCount.set(1);
    }
    const fixture = mount();
    const el = fixture.nativeElement as HTMLElement;
    const av1 = http.expectOne(runnerUrl());
    expect(av1.request.method).toBe('GET');
    const answer = opts.av1 ?? item;
    if (typeof answer === 'number') av1.flush({ code: 'runner_not_found' }, httpError(answer));
    else av1.flush(answer);
    await settle(fixture);
    if (opts.docs !== false) {
      flushDocs();
      await settle(fixture);
    }
    return { fixture, el, s };
  }

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
    const d = el.querySelector<HTMLElement>('.confirm-card[role="dialog"]');
    if (!d) throw new Error('no dialog');
    return d;
  }

  function type(fixture: Fixture, area: HTMLTextAreaElement, value: string) {
    area.value = value;
    area.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it("renders the owner's runner: header, caption, four actionable rows and a compact phone row", async () => {
    const { el } = await open();
    const text = el.textContent ?? '';
    // Header: not a button.
    expect(el.querySelector('button.verif-top')).toBeNull();
    const avatar = el.querySelector('.verif-avatar')!;
    expect(avatar.textContent?.trim()).toBe('MW');
    expect(avatar.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('.verif-name')?.textContent).toBe('Mercy W.');
    const subs = Array.from(el.querySelectorAll('.verif-sub')).map((s) => s.textContent);
    expect(subs).toEqual(['Applied 2d ago · Kilimani +1', '#NT-C0CA7 · +254 712 345 678']);
    const [applied, idPhone] = Array.from(el.querySelectorAll<HTMLElement>('.verif-sub'));
    expect(applied.classList.contains('num')).toBe(false);
    expect(Array.from(applied.querySelectorAll('.num')).map((n) => n.textContent)).toEqual([
      '2d ago',
      '+1',
    ]);
    expect(idPhone.classList.contains('num')).toBe(true);
    expect(el.querySelector('.verif-level')?.textContent).toBe(
      'Level 1 — Basic · Level 2 needs: ID front, ID back, selfie',
    );
    const header = el.querySelector('section.drawer-section')!;
    expect(el.querySelector(`#${header.getAttribute('aria-labelledby')}`)?.textContent).toBe(
      'Mercy W.',
    );
    expect(button(el, 'Open runner profile').className).toContain('btn-text');
    expect(text.replace(/\s+/g, ' ')).toContain(
      'Each image shown here is logged with your name and the time. Viewing never extends how long images are kept.',
    );

    // Rows: one labelled section each.
    expect(el.querySelectorAll('section.doc-check').length).toBe(5);
    expect(el.querySelectorAll('.btn-approve').length).toBe(4);
    expect(el.querySelectorAll('.btn-reject').length).toBe(4);
    for (const label of [
      'National ID · Front',
      'National ID · Back',
      'Selfie / liveness check',
      'M-Pesa identity match',
    ]) {
      expect(row(el, label).head.closest('section')?.getAttribute('aria-label')).toBe(label);
      expect(row(el, label).head.querySelector('.doc-status.pending')?.textContent).toBe(
        'Pending review',
      );
      expect(detail(el, label).querySelector('.btn-approve')).toBeTruthy();
    }
    const phone = row(el, 'Phone number');
    expect(phone.head.querySelector('.doc-status')?.textContent).toBe('Verified');
    expect(phone.detail?.textContent?.trim()).toBe('Verified at sign-in');
    expect(phone.detail?.querySelector('button')).toBeNull();

    const front = detail(el, 'National ID · Front');
    expect(front.querySelector('.drawer-row b')?.textContent).toContain('10:30 AM');
    expect(button(front, 'Approve').getAttribute('aria-label')).toBe(
      'Approve National ID · Front for Mercy W.',
    );
    expect(button(front, 'Reject').getAttribute('aria-label')).toBe(
      'Reject National ID · Front for Mercy W.',
    );
    expect(detail(el, 'M-Pesa identity match').textContent).not.toContain('Image');
    // The new-tab flow is gone.
    expect(text).not.toContain('View image');
    expect(el.querySelector('a')).toBeNull();
    expect(text).not.toContain('NaN');
  });

  it('falls back to R and the short id when the runner has no name', async () => {
    const { el } = await open(
      runner(ownersChecks(), {
        user: { id: USER, phone: '+254712345678', displayName: null, shortName: null },
        runnerProfile: { ...RUNNER, serviceAreas: [] },
      }),
    );
    expect(el.querySelector('.verif-avatar')?.textContent?.trim()).toBe('R');
    const name = el.querySelector('.verif-name')!;
    expect(name.textContent).toBe('#NT-C0CA7');
    expect(name.classList.contains('num')).toBe(true);
    const subs = Array.from(el.querySelectorAll('.verif-sub')).map((s) => s.textContent);
    expect(subs).toEqual(['Applied 2d ago', '+254 712 345 678']);
  });

  it('switches to the runner profile drawer', async () => {
    const { el } = await open();
    button(el, 'Open runner profile').click();
    expect(TestBed.inject(DrawerNavService).current()).toEqual({ kind: 'runner', id: PROFILE });
  });

  it('approves one row and reflects the new level in the drawer and the store', async () => {
    const { fixture, el, s } = await open();
    button(detail(el, 'Selfie / liveness check'), 'Approve').click();
    fixture.detectChanges();
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
        runnerProfile: { ...RUNNER, verificationLevel: '2_id_verified', level2Missing: [] },
      }),
    );
    await settle(fixture);
    expect(el.textContent).toContain('Check approved.');
    expect(row(el, 'Selfie / liveness check').head.textContent).toContain('Verified');
    expect(detail(el, 'Selfie / liveness check').textContent).toContain(
      'Decided · Approved · Grace A.',
    );
    expect(el.querySelector('.verif-level')?.textContent).toBe('Level 2 — ID verified');
    expect(s.awaitingReviewCount()).toBe(1);
    expect(s.verificationSaves()).toBe(1);
    // The decision did not ask for the image again.
    http.expectNone(isDocument);
  });

  it('merges side, hasDocument and purgedAt from a full answer and keeps the runner on a bare one', async () => {
    const { fixture, el, s } = await open();
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
    const back = s.verificationQueue()[0].checks.find((c) => c.id === 'v-back')!;
    expect(back.status).toBe('approved');
    expect(back.user?.phone).toBe('+254712345678');
    expect(back.reviewer).toEqual({ id: ADMIN, displayName: null });
    expect(el.querySelector('.verif-name')?.textContent).toBe('Mercy W.');
    expect(detail(el, 'National ID · Back').textContent).toContain('Decided · Approved · #NT-');
  });

  it('drops the awaiting count when the runner has no pending check left', async () => {
    const checks = ownersChecks().map((c) =>
      c.id === 'v-pay' ? c : { ...c, status: 'approved' as const },
    );
    const { fixture, el, s } = await open(runner(checks));
    s.awaitingReviewCount.set(3);
    button(detail(el, 'M-Pesa identity match'), 'Approve').click();
    http
      .expectOne(`${API}/runners/${PROFILE}/verifications/v-pay`)
      .flush(check('v-pay', { verificationType: 'payment_identity', status: 'approved' }));
    await settle(fixture);
    expect(s.awaitingReviewCount()).toBe(2);
    expect(el.querySelectorAll('section.doc-check').length).toBe(5);
  });

  it('counts only the newest record per check as pending (superseded pending ID front, W-1)', async () => {
    const checks = [
      check('v-front-new', { side: 'front', createdAt: '2026-10-21T07:00:00Z' }),
      ...ownersChecks().map((c) =>
        c.id === 'v-phone' ? c : { ...c, status: 'approved' as const },
      ),
      check('v-front-old', { side: 'front', createdAt: '2026-10-18T07:00:00Z' }),
    ].filter((c) => c.id !== 'v-front');
    const { fixture, el, s } = await open(runner(checks, { pendingCount: 1 }));
    s.awaitingReviewCount.set(3);
    expect(el.querySelectorAll('.btn-approve').length).toBe(1);
    button(detail(el, 'National ID · Front'), 'Approve').click();
    http
      .expectOne(`${API}/runners/${PROFILE}/verifications/v-front-new`)
      .flush(check('v-front-new', { side: 'front', status: 'approved' }));
    await settle(fixture);
    expect(s.awaitingReviewCount()).toBe(2);
    const item = s.verificationQueue()[0];
    expect(item.pendingCount).toBe(0);
    expect(item.checks.find((c) => c.id === 'v-front-old')?.status).toBe('pending');
  });

  it('takes the Level 2 gaps from the API, not from the rows (legacy ID counted by the API)', async () => {
    const legacy = [
      check('v-legacy', { status: 'approved' }),
      check('v-front', { side: 'front', status: 'approved' }),
      check('v-selfie', { verificationType: 'selfie' }),
    ];
    const { el } = await open(
      runner(legacy, { runnerProfile: { ...RUNNER, level2Missing: ['selfie'] } }),
    );
    expect(el.querySelector('.verif-level')?.textContent).toBe(
      'Level 1 — Basic · Level 2 needs: selfie',
    );
  });

  it('updates the level line from the answer after each decision', async () => {
    const { fixture, el, s } = await open();
    button(detail(el, 'National ID · Front'), 'Approve').click();
    http.expectOne(`${API}/runners/${PROFILE}/verifications/v-front`).flush(
      check('v-front', {
        side: 'front',
        status: 'approved',
        reviewedBy: ADMIN,
        reviewedAt: '2026-10-21T08:00:00Z',
        runnerProfile: { ...RUNNER, level2Missing: ['government_id_back', 'selfie'] },
      }),
    );
    await settle(fixture);
    expect(el.querySelector('.verif-level')?.textContent).toBe(
      'Level 1 — Basic · Level 2 needs: ID back, selfie',
    );
    expect(s.verificationQueue()[0].verification.level2Missing).toEqual([
      'government_id_back',
      'selfie',
    ]);
  });

  it('drops the line back to Level 1 after a Level 2 check is rejected', async () => {
    const approved = ownersChecks().map((c) =>
      c.verificationType === 'payment_identity' ? c : { ...c, status: 'approved' as const },
    );
    const reupload = check('v-selfie-2', {
      verificationType: 'selfie',
      createdAt: '2026-10-21T09:00:00Z',
    });
    const level2 = { ...RUNNER, verificationLevel: '2_id_verified', level2Missing: [] };
    const { fixture, el, s } = await open(
      runner([reupload, ...approved], { runnerProfile: level2 }),
    );
    expect(el.querySelector('.verif-level')?.textContent).toBe('Level 2 — ID verified');

    button(detail(el, 'Selfie / liveness check'), 'Reject').click();
    fixture.detectChanges();
    button(dialog(el), 'Reject check').click();
    http.expectOne(`${API}/runners/${PROFILE}/verifications/v-selfie-2`).flush(
      check('v-selfie-2', {
        verificationType: 'selfie',
        status: 'rejected',
        reviewedBy: ADMIN,
        reviewedAt: '2026-10-21T09:30:00Z',
        createdAt: '2026-10-21T09:00:00Z',
        runnerProfile: { ...RUNNER, verificationLevel: '1_basic', level2Missing: ['selfie'] },
      }),
    );
    await settle(fixture);
    expect(el.querySelector('.verif-level')?.textContent).toBe(
      'Level 1 — Basic · Level 2 needs: selfie',
    );
    expect(s.verificationQueue()[0].runnerProfile.verificationLevel).toBe('1_basic');
  });

  it('rejects through the dialog with a trimmed internal note', async () => {
    const { fixture, el } = await open();
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
    expect(el.querySelector('.confirm-card')).toBeNull();
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
    const { fixture, el } = await open();
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
    const { fixture, el } = await open();
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

  it('refreshes this runner with a notice in the drawer when the check was already decided (404 or 409)', async () => {
    for (const status of [404, 409]) {
      const { fixture, el, s } = await open();
      button(detail(el, 'Selfie / liveness check'), 'Approve').click();
      http
        .expectOne(`${API}/runners/${PROFILE}/verifications/v-selfie`)
        .flush(
          status === 409 ? { code: 'verification_already_decided', status: 'approved' } : null,
          httpError(status),
        );
      await flushAsync();
      const decided = ownersChecks().map((c) =>
        c.id === 'v-selfie' ? { ...c, status: 'approved' as const } : c,
      );
      http.expectOne(runnerUrl()).flush(runner(decided));
      await settle(fixture);
      expect(el.textContent).toContain('This check was already decided. The list is updated.');
      expect(row(el, 'Selfie / liveness check').head.textContent).toContain('Verified');
      // The table reloads when the drawer closes.
      expect(s.verificationSaves()).toBeGreaterThan(0);
      fixture.destroy();
      s.verificationQueue.set([]);
    }
  });

  it('closes the reject dialog and refreshes on a 409', async () => {
    const { fixture, el } = await open();
    button(detail(el, 'National ID · Front'), 'Reject').click();
    fixture.detectChanges();
    button(dialog(el), 'Reject check').click();
    http
      .expectOne(`${API}/runners/${PROFILE}/verifications/v-front`)
      .flush({ code: 'verification_already_decided', status: 'rejected' }, httpError(409));
    await flushAsync();
    http.expectOne(runnerUrl()).flush(runner(ownersChecks()));
    await settle(fixture);
    expect(el.querySelector('.confirm-card')).toBeNull();
    expect(el.textContent).toContain('This check was already decided. The list is updated.');
  });

  it('hides the admin note on a purged check', async () => {
    const { el } = await open(
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
    );
    expect(el.textContent).not.toContain('Admin note');
    expect(el.textContent).not.toContain('Re-review evidence');
  });

  it('records a re-review with a trimmed optional note and lists it', async () => {
    const { fixture, el } = await open(
      runner([
        check('v1', {
          side: 'front',
          status: 'approved',
          reviewedAt: '2026-10-20T08:00:00Z',
          reviewedBy: ADMIN,
          reviewer: { id: ADMIN, displayName: 'Grace A.' },
        }),
      ]),
    );
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

  it('sends a blank re-review note as no note and refreshes on a 409', async () => {
    const item = runner([
      check('v1', {
        side: 'back',
        status: 'rejected',
        reviewedAt: '2026-10-20T08:00:00Z',
        reviewedBy: ADMIN,
      }),
    ]);
    const { fixture, el } = await open(item);
    button(el, 'Re-review evidence').click();
    fixture.detectChanges();
    type(fixture, dialog(el).querySelector('textarea') as HTMLTextAreaElement, '   ');
    button(el, 'Record re-review').click();
    const req = http.expectOne(`${API}/runners/verifications/v1/re-review`);
    expect(req.request.body).toEqual({});
    req.flush({ code: 'verification_not_decided' }, httpError(409));
    await flushAsync();
    http.expectOne(runnerUrl()).flush(item);
    await settle(fixture);
    expect(el.textContent).toContain('Decide this check first.');
  });

  describe('opening', () => {
    it('shows Loading documents… until AV-1 answers when the runner is not in the store, then asks for images', async () => {
      const s = TestBed.inject(AdminDataService);
      const fixture = mount();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.textContent).toContain('Loading documents…');
      // No image call before the checks are shown.
      http.expectNone(isDocument);
      http.expectOne(runnerUrl()).flush(runner(ownersChecks()));
      await settle(fixture);
      expect(s.verificationDetail()?.runnerProfile.id).toBe(PROFILE);
      expect(flushDocs().sort()).toEqual(['v-back', 'v-front', 'v-selfie']);
      await settle(fixture);
      expect(el.querySelectorAll('section.doc-check').length).toBe(5);
    });

    it('does not ask for an image again when AV-1 returns the same records', async () => {
      const s = TestBed.inject(AdminDataService);
      s.verificationQueue.set([runner(ownersChecks())]);
      const fixture = mount();
      expect(flushDocs().sort()).toEqual(['v-back', 'v-front', 'v-selfie']);
      http.expectOne(runnerUrl()).flush(runner(ownersChecks()));
      await settle(fixture);
      http.expectNone(isDocument);
    });

    it("shows This runner isn't in the list any more on a 404", async () => {
      const { el } = await open(undefined, { av1: 404, docs: false });
      http
        .match(isDocument)
        .forEach((r) => r.flush({ verificationId: 'x', url: null, expiresAt: null }));
      expect(el.textContent).toContain("This runner isn't in the list any more");
      expect(el.textContent).toContain('Refresh the list and open them again.');
      expect(el.querySelector('.doc-check')).toBeNull();
    });

    it('keeps the store runner with a Try again notice when AV-1 fails, and shows only the notice without one', async () => {
      const { fixture, el } = await open(undefined, { av1: 500 });
      expect(el.textContent).toContain("Couldn't refresh this runner. Try again.");
      expect(el.querySelectorAll('section.doc-check').length).toBe(5);
      button(el, 'Try again').click();
      http.expectOne(runnerUrl()).flush(runner(ownersChecks()));
      await settle(fixture);
      expect(el.textContent).not.toContain("Couldn't refresh this runner.");
      fixture.destroy();

      TestBed.inject(AdminDataService).verificationQueue.set([]);
      const bare = await open(undefined, { inStore: false, av1: 500, docs: false });
      expect(bare.el.textContent).toContain("Couldn't refresh this runner. Try again.");
      expect(bare.el.querySelector('.doc-check')).toBeNull();
      http.expectNone(isDocument);
    });
  });

  describe('images (rows 278, 279)', () => {
    it('asks once per stored newest ID / selfie record, never for purged, imageless, superseded or non-image checks', async () => {
      const checks: RunnerVerification[] = [
        check('front-new', { side: 'front', createdAt: '2026-10-21T07:00:00Z' }),
        check('front-old', { side: 'front', createdAt: '2026-10-18T07:00:00Z' }),
        check('back-purged', {
          side: 'back',
          status: 'approved',
          purgedAt: '2026-10-21T05:00:00Z',
        }),
        check('legacy-none', { side: null, status: 'rejected', hasDocument: false }),
        check('selfie', { verificationType: 'selfie' }),
        check('pay', { verificationType: 'payment_identity', hasDocument: true }),
        check('phone', { verificationType: 'phone', status: 'approved', hasDocument: false }),
      ];
      const { el } = await open(runner(checks), { docs: false });
      const calls = http.match(isDocument);
      expect(calls.map((r) => r.request.url).sort()).toEqual(
        [documentUrl('front-new'), documentUrl('selfie')].sort(),
      );
      calls.forEach((r) =>
        r.flush({
          verificationId: 'x',
          url: 'https://signed.example/x',
          expiresAt: inFiveMinutes(),
        }),
      );
      expect(el.querySelectorAll('.doc-preview').length).toBe(2);
    });

    it('shows a Loading frame, then the image (contain, no referrer, alt) in a full-size button', async () => {
      const { fixture, el } = await open(undefined, { docs: false });
      const front = detail(el, 'National ID · Front');
      const wait = front.querySelector<HTMLElement>('.doc-preview.is-loading')!;
      expect(wait.getAttribute('aria-busy')).toBe('true');
      expect(wait.textContent?.trim()).toBe('Loading image…');
      flushDocs();
      await settle(fixture);
      const frame = front.querySelector<HTMLButtonElement>('button.doc-preview')!;
      expect(frame.getAttribute('aria-label')).toBe(
        'Open National ID · Front image for Mercy W. full size',
      );
      const img = frame.querySelector('img')!;
      expect(img.getAttribute('src')).toBe(SIGNED('v-front'));
      expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
      expect(img.getAttribute('decoding')).toBe('async');
      expect(img.getAttribute('alt')).toBe('National ID · Front for Mercy W.');
      expect(img.getAttribute('title')).toBeNull();
      expect(el.querySelector('a')).toBeNull();
      expect(el.querySelectorAll('.doc-preview img').length).toBe(3);
    });

    it('says the preview is not available when the API has no storage (url null)', async () => {
      const { fixture, el } = await open(undefined, { docs: false });
      flushDocs('null');
      await settle(fixture);
      expect(detail(el, 'National ID · Front').textContent).toContain(
        "Image preview isn't available in this environment.",
      );
      expect(el.querySelector('img')).toBeNull();
    });

    it('switches to Deleted on a 410 and to No image on a missing 404, updating the store', async () => {
      const { fixture, el, s } = await open(undefined, { docs: false });
      http
        .expectOne(documentUrl('v-back'))
        .flush(
          { code: 'verification_document_purged', purgedAt: '2026-10-21T05:00:00Z' },
          httpError(410),
        );
      http
        .expectOne(documentUrl('v-selfie'))
        .flush({ code: 'verification_document_missing' }, httpError(404));
      http
        .expectOne(documentUrl('v-front'))
        .flush({ code: 'verification_document_purged' }, httpError(410));
      await settle(fixture);
      const back = detail(el, 'National ID · Back');
      expect(back.textContent).toContain('Deleted');
      expect(back.querySelector('.val-muted .num')?.textContent).toContain('8:00 AM');
      expect(back.textContent).toContain('Deleted at the end of the retention period.');
      expect(back.querySelector('.doc-preview')).toBeNull();
      // 410 without `purgedAt`: `Deleted`, no date.
      expect(
        detail(el, 'National ID · Front').querySelector('.val-muted')?.textContent?.trim(),
      ).toBe('Deleted');
      expect(detail(el, 'Selfie / liveness check').textContent).toContain('No image on file');
      const checks = s.verificationQueue()[0].checks;
      expect(checks.find((c) => c.id === 'v-back')?.purgedAt).toBe('2026-10-21T05:00:00Z');
      expect(checks.find((c) => c.id === 'v-selfie')?.hasDocument).toBe(false);
      http.expectNone(isDocument);
    });

    it("shows Couldn't load with Try again (one call per click), and the access copy on a 403", async () => {
      const { fixture, el } = await open(undefined, { docs: false });
      http.expectOne(documentUrl('v-front')).flush(null, httpError(500));
      http.expectOne(documentUrl('v-back')).flush(null, httpError(403));
      http.expectOne(documentUrl('v-selfie')).flush(null, httpError(500));
      await settle(fixture);
      const front = detail(el, 'National ID · Front');
      expect(front.textContent).toContain("Couldn't load the image.");
      const back = detail(el, 'National ID · Back');
      expect(back.textContent).toContain(FORBIDDEN_COPY);
      expect(back.textContent).not.toContain('Try again');

      button(front, 'Try again').click();
      fixture.detectChanges();
      expect(front.querySelector('.doc-preview.is-loading')).toBeTruthy();
      http.expectOne(documentUrl('v-front')).flush({
        verificationId: 'v-front',
        url: SIGNED('v-front'),
        expiresAt: inFiveMinutes(),
      });
      await settle(fixture);
      expect(front.querySelector('img')?.getAttribute('src')).toBe(SIGNED('v-front'));
      http.expectNone(isDocument);
    });

    it('asks again once only when the image fails after its link expired', async () => {
      const { fixture, el } = await open(undefined, { docs: false });
      flushDocs('link', expired());
      await settle(fixture);
      const front = detail(el, 'National ID · Front');
      front.querySelector('img')!.dispatchEvent(new Event('error'));
      fixture.detectChanges();
      http.expectOne(documentUrl('v-front')).flush({
        verificationId: 'v-front',
        url: SIGNED('v-front') + '?2',
        expiresAt: expired(),
      });
      await settle(fixture);
      front.querySelector('img')!.dispatchEvent(new Event('error'));
      fixture.detectChanges();
      // Second failure: no automatic call, Try again instead.
      http.expectNone(isDocument);
      expect(front.textContent).toContain("Couldn't load the image.");
      expect(button(front, 'Try again')).toBeTruthy();
    });

    it('does not ask again when the image fails before its link expired', async () => {
      const { fixture, el } = await open(undefined, { docs: false });
      flushDocs('link', inFiveMinutes());
      await settle(fixture);
      const front = detail(el, 'National ID · Front');
      front.querySelector('img')!.dispatchEvent(new Event('error'));
      fixture.detectChanges();
      http.expectNone(isDocument);
      expect(front.textContent).toContain("Couldn't load the image.");
    });

    it('keeps no link anywhere once the drawer closes', async () => {
      const { fixture, el, s } = await open();
      expect(el.querySelectorAll('img').length).toBe(3);
      const stored = JSON.stringify([s.verificationQueue(), s.verificationDetail()]);
      expect(stored).not.toContain('signed.example');
      close(fixture);
      expect(el.querySelector('app-runner-verification-drawer')).toBeNull();
      expect(s.verificationDetail()).toBeNull();
      expect(JSON.stringify(s.verificationQueue())).not.toContain('signed.example');
      expect(document.querySelector('img[src*="signed.example"]')).toBeNull();
      expect(JSON.stringify({ ...localStorage })).not.toContain('signed.example');
      expect(JSON.stringify({ ...sessionStorage })).not.toContain('signed.example');
    });

    describe('full-size viewer (A-17)', () => {
      it('reuses the live link before expiry; ESC closes only the viewer and returns focus', async () => {
        const { fixture, el } = await open();
        const frame = detail(el, 'National ID · Front').querySelector<HTMLButtonElement>(
          'button.doc-preview',
        )!;
        frame.focus();
        frame.click();
        fixture.detectChanges();
        await settle(fixture);
        http.expectNone(isDocument);
        const viewer = document.body.querySelector<HTMLElement>(':scope > app-image-viewer')!;
        expect(viewer).toBeTruthy();
        expect(viewer.querySelector('img')?.getAttribute('src')).toBe(SIGNED('v-front'));
        expect(viewer.querySelector('img')?.getAttribute('referrerpolicy')).toBe('no-referrer');
        expect(viewer.textContent).toContain('National ID · Front · Mercy W.');
        expect(document.activeElement?.getAttribute('aria-label')).toBe('Close');

        const drawerEsc = vi.fn();
        document.addEventListener('keydown', drawerEsc);
        document.activeElement!.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
        );
        fixture.detectChanges();
        document.removeEventListener('keydown', drawerEsc);
        expect(drawerEsc).not.toHaveBeenCalled();
        expect(document.querySelector('app-image-viewer')).toBeNull();
        expect(document.activeElement).toBe(frame);
      });

      it('asks for a new link first when opened after expiry', async () => {
        const { fixture, el } = await open(undefined, { docs: false });
        flushDocs('link', expired());
        await settle(fixture);
        detail(el, 'Selfie / liveness check')
          .querySelector<HTMLButtonElement>('button.doc-preview')!
          .click();
        fixture.detectChanges();
        const viewer = document.querySelector<HTMLElement>('app-image-viewer')!;
        expect(viewer.textContent).toContain('Loading image…');
        http.expectOne(documentUrl('v-selfie')).flush({
          verificationId: 'v-selfie',
          url: SIGNED('v-selfie') + '?fresh',
          expiresAt: inFiveMinutes(),
        });
        await settle(fixture);
        expect(viewer.querySelector('img')?.getAttribute('src')).toBe(
          SIGNED('v-selfie') + '?fresh',
        );
        http.expectNone(isDocument);
      });

      it('is removed with the drawer', async () => {
        const { fixture, el } = await open();
        detail(el, 'National ID · Back')
          .querySelector<HTMLButtonElement>('button.doc-preview')!
          .click();
        fixture.detectChanges();
        expect(document.querySelector('app-image-viewer')).toBeTruthy();
        close(fixture);
        expect(document.querySelector('app-image-viewer')).toBeNull();
        expect(document.querySelector('img[src*="signed.example"]')).toBeNull();
      });
    });
  });
});
