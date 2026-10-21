import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { API, flushAsync, httpError, setupHttp } from '../../../testing/admin-test-utils';
import {
  VERIFICATION_STATUS_FILTERS,
  VerificationsPanelComponent,
  verificationTypeLabel,
} from './verifications.panel';
import { AdminDataService, timeAgo } from '../admin-data.service';
import type { RunnerVerification } from '../../../core/api-types';

const PROFILE = 'aad1988f-1111-2222-3333-75662a9c0ca7';
const USER = 'bbbbbbbb-1111-2222-3333-000000000001';
const ADMIN = 'adadadad-1111-2222-3333-0000000a0001';

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
    runnerProfile: { id: PROFILE, userId: USER },
    user: { id: USER, phone: '+254712345678' },
    reviewer: null,
    reReviews: [],
    ...patch,
  };
}

/** The owner's runner (local DB, 2026-10-21): 4 pending checks and the auto-approved phone. */
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

const list = (r: { url: string }) => r.url === `${API}/runners/verifications`;

describe('verification labels and filters', () => {
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

  it('offers only the API status values', () => {
    expect(VERIFICATION_STATUS_FILTERS.map((f) => f.value)).toEqual([
      'pending',
      'approved',
      'rejected',
    ]);
  });

  it('timeAgo never reads NaN', () => {
    expect(timeAgo(undefined)).toBe('—');
    expect(timeAgo('not a date')).toBe('—');
  });
});

describe('VerificationsPanelComponent', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    http = setupHttp();
  });
  afterEach(() => http.verify());

  async function render(items: RunnerVerification[] = ownersChecks()) {
    const fixture = TestBed.createComponent(VerificationsPanelComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Loading…');
    const req = http.expectOne(list);
    expect(req.request.params.get('status')).toBeNull();
    req.flush({ items, nextCursor: null });
    await flushAsync();
    fixture.detectChanges();
    return { fixture, el };
  }

  function card(el: HTMLElement, label: string): HTMLElement {
    const found = Array.from(el.querySelectorAll<HTMLElement>('.verif-card')).find((c) =>
      c.textContent?.includes(label),
    );
    if (!found) throw new Error(`no card ${label}`);
    return found;
  }

  function button(root: HTMLElement, text: string): HTMLButtonElement {
    const found = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent?.trim() === text,
    );
    if (!found) throw new Error(`no button ${text}`);
    return found;
  }

  it("renders the owner's five checks with labels, dates and image states", async () => {
    const { el } = await render();
    const text = el.textContent ?? '';
    // The auto-approved phone check does render as a fifth card (finding 46 waits on AQ-35).
    expect(el.querySelectorAll('.verif-card').length).toBe(5);
    expect(text).toContain('5 items · 4 pending');
    for (const label of [
      'National ID · Front',
      'National ID · Back',
      'Selfie / liveness check',
      'M-Pesa identity match',
      'Phone number',
    ]) {
      expect(text).toContain(label);
    }
    expect(text).not.toContain('NaN');
    expect(text).not.toContain('payment identity');
    expect(text).not.toContain('runner level upgrades');
    expect(text).toContain('Opening an image is logged.');
    expect(text).toContain('+254 712 345 678');
    expect(el.querySelector('.verif-sub')?.textContent).toContain('+254 712 345 678');
    // Submitted from createdAt, 12-hour EAT (10:30 AM), in Fira Code.
    const front = card(el, 'National ID · Front');
    expect(front.querySelector('.vc-row b.num')?.textContent).toContain('10:30 AM');
    // Stored image: a button, never a pre-built link.
    expect(front.querySelector('a[href]')).toBeNull();
    expect(button(front, 'View image').getAttribute('aria-label')).toMatch(
      /^View National ID · Front image for #NT-\w+, opens in a new tab$/,
    );
    // Payment identity / phone: no image line; avatar is decorative.
    expect(card(el, 'M-Pesa identity match').textContent).not.toContain('Image');
    expect(card(el, 'Phone number').textContent).not.toContain('Image');
    expect(card(el, 'Phone number').querySelector('.vc-actions')).toBeNull();
    expect(front.querySelector('.runner-avatar')?.getAttribute('aria-hidden')).toBe('true');
    expect(button(front, 'Approve').getAttribute('aria-label')).toMatch(
      /^Approve National ID · Front for #NT-/,
    );
  });

  it('approves through the three-segment path and merges the bare answer', async () => {
    const { fixture, el } = await render();
    const front = card(el, 'National ID · Front');
    button(front, 'Reject').click();
    fixture.detectChanges();
    expect(button(front, 'Rejecting…').disabled).toBe(true);
    expect(button(front, 'Approve').disabled).toBe(true);
    const req = http.expectOne(`${API}/runners/${PROFILE}/verifications/v-front`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ decision: 'rejected' });
    const {
      runnerProfile: _p,
      user: _u,
      reviewer: _r,
      reReviews: _rr,
      ...bare
    } = check('v-front', { side: 'front' });
    req.flush({
      ...bare,
      status: 'rejected',
      reviewedBy: ADMIN,
      reviewedAt: '2026-10-21T08:00:00Z',
    });
    await flushAsync();
    fixture.detectChanges();
    const item = TestBed.inject(AdminDataService)
      .verifications()
      .find((v) => v.id === 'v-front')!;
    expect(item.status).toBe('rejected');
    expect(item.user?.phone).toBe('+254712345678');
    expect(item.runnerProfile?.id).toBe(PROFILE);
    expect(el.textContent).toContain('Check rejected.');
    const after = card(el, 'National ID · Front');
    expect(after.textContent).toContain('+254 712 345 678');
    expect(after.textContent).toContain('Decided · Rejected');
    expect(after.querySelector('.vc-actions')?.textContent).toContain('Re-review evidence');
  });

  it('accepts the full list item from the PATCH (api-contract fix) as well', async () => {
    const { fixture, el } = await render();
    button(card(el, 'Selfie / liveness check'), 'Approve').click();
    fixture.detectChanges();
    expect(button(card(el, 'Selfie / liveness check'), 'Approving…')).toBeTruthy();
    expect(button(card(el, 'Selfie / liveness check'), 'Reject')).toBeTruthy();
    http.expectOne(`${API}/runners/${PROFILE}/verifications/v-selfie`).flush(
      check('v-selfie', {
        verificationType: 'selfie',
        status: 'approved',
        reviewedBy: ADMIN,
        reviewedAt: '2026-10-21T08:00:00Z',
        reviewer: { id: ADMIN, displayName: 'Grace A.' },
      }),
    );
    await flushAsync();
    fixture.detectChanges();
    expect(el.textContent).toContain('Check approved.');
    expect(card(el, 'Selfie / liveness check').textContent).toContain(
      'Decided · Approved · Grace A.',
    );
  });

  it('reloads with a notice when the check was already decided (404 or 409)', async () => {
    for (const status of [404, 409]) {
      const { fixture, el } = await render();
      button(card(el, 'Selfie / liveness check'), 'Approve').click();
      http
        .expectOne(`${API}/runners/${PROFILE}/verifications/v-selfie`)
        .flush(
          status === 409 ? { code: 'verification_already_decided', status: 'approved' } : null,
          httpError(status),
        );
      await flushAsync();
      http.expectOne(list).flush({ items: ownersChecks(), nextCursor: null });
      await flushAsync();
      fixture.detectChanges();
      expect(el.textContent).toContain('This check was already decided. The list is updated.');
      fixture.destroy();
      TestBed.inject(AdminDataService).verifications.set([]);
    }
  });

  it('opens a fresh signed link only on click, in a new tab', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { fixture, el } = await render();
    http.expectNone(`${API}/runners/verifications/v-front/document`);
    button(card(el, 'National ID · Front'), 'View image').click();
    fixture.detectChanges();
    expect(button(card(el, 'National ID · Front'), 'Opening…').disabled).toBe(true);
    http.expectOne(`${API}/runners/verifications/v-front/document`).flush({
      verificationId: 'v-front',
      url: 'https://signed.example/img',
      expiresAt: '2026-10-21T08:05:00Z',
    });
    await flushAsync();
    expect(open).toHaveBeenCalledWith(
      'https://signed.example/img',
      '_blank',
      'noopener,noreferrer',
    );
    open.mockRestore();
  });

  it('switches to Deleted on a 410 and to No image on a missing document', async () => {
    const { fixture, el } = await render();
    button(card(el, 'National ID · Back'), 'View image').click();
    http
      .expectOne(`${API}/runners/verifications/v-back/document`)
      .flush(
        { code: 'verification_document_purged', purgedAt: '2026-10-21T05:00:00Z' },
        httpError(410),
      );
    await flushAsync();
    fixture.detectChanges();
    const back = card(el, 'National ID · Back');
    expect(back.textContent).toContain('Deleted');
    expect(back.textContent).toContain('8:00 AM');
    expect(el.textContent).toContain('This image was deleted at the end of the retention period.');

    button(card(el, 'Selfie / liveness check'), 'View image').click();
    http
      .expectOne(`${API}/runners/verifications/v-selfie/document`)
      .flush({ code: 'verification_document_missing' }, httpError(404));
    await flushAsync();
    fixture.detectChanges();
    expect(card(el, 'Selfie / liveness check').textContent).toContain('No image on file');
    expect(el.textContent).toContain('No image is stored for this check.');
  });

  it('hides the admin note on a purged check', async () => {
    const { el } = await render([
      check('v1', {
        status: 'approved',
        reviewerNote: 'Matches',
        reviewedAt: '2026-10-20T08:00:00Z',
        reviewedBy: ADMIN,
        purgedAt: '2026-10-21T05:00:00Z',
      }),
    ]);
    expect(el.textContent).not.toContain('Admin note');
    expect(el.textContent).not.toContain('Re-review evidence');
  });

  it('records a re-review with a trimmed optional note and lists it', async () => {
    const { fixture, el } = await render([
      check('v1', {
        side: 'front',
        status: 'approved',
        reviewedAt: '2026-10-20T08:00:00Z',
        reviewedBy: ADMIN,
        reviewer: { id: ADMIN, displayName: 'Grace A.' },
      }),
    ]);
    expect(el.textContent).toContain('Decided · Approved · Grace A.');
    button(el, 'Re-review evidence').click();
    fixture.detectChanges();
    expect(el.textContent).toContain('Re-review this evidence?');
    expect(el.textContent).toContain('0/500');
    const area = el.querySelector('textarea') as HTMLTextAreaElement;
    area.value = '  Second look  ';
    area.dispatchEvent(new Event('input'));
    fixture.detectChanges();
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
    await flushAsync();
    fixture.detectChanges();
    expect(el.textContent).toContain('Re-review recorded.');
    expect(el.textContent).toContain('Re-reviewed · Grace A.');
    expect(el.textContent).toContain('Second look');
    expect(el.textContent).not.toContain('Re-review this evidence?');
  });

  it('sends a blank re-review note as no note and handles 409', async () => {
    const { fixture, el } = await render([
      check('v1', { status: 'rejected', reviewedAt: '2026-10-20T08:00:00Z', reviewedBy: ADMIN }),
    ]);
    button(el, 'Re-review evidence').click();
    fixture.detectChanges();
    const area = el.querySelector('textarea') as HTMLTextAreaElement;
    area.value = '   ';
    area.dispatchEvent(new Event('input'));
    button(el, 'Record re-review').click();
    const req = http.expectOne(`${API}/runners/verifications/v1/re-review`);
    expect(req.request.body).toEqual({});
    req.flush({ code: 'verification_not_decided' }, httpError(409));
    await flushAsync();
    http.expectOne(list).flush({ items: [], nextCursor: null });
    await flushAsync();
    fixture.detectChanges();
    expect(el.textContent).toContain('Decide this check first.');
  });

  it('filters with API values only', async () => {
    const { fixture, el } = await render();
    const select = el.querySelector('select') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual([
      '',
      'pending',
      'approved',
      'rejected',
    ]);
    select.value = 'approved';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    const req = http.expectOne(list);
    expect(req.request.params.get('status')).toBe('approved');
    req.flush({ items: [], nextCursor: null });
  });
});
