import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { API, errandFixture, flushAsync, setupHttp } from '../../../testing/admin-test-utils';
import { FORBIDDEN_COPY } from '../../../core/api-error';
import { DrawerNavService } from '../drawer-nav.service';
import type { Errand, ErrandAssignmentView } from '../../../core/api-types';
import { TaskOfferSectionComponent } from './task-offer.section';
import { declineReasonLabel, expireFailure, offerSectionState, TASK_CHANGED } from './task-offer';

function offer(patch: Partial<ErrandAssignmentView> = {}): ErrandAssignmentView {
  return {
    id: 'a1',
    status: 'declined',
    assignedAt: '2026-10-19T07:05:00Z',
    offerExpiresAt: '2026-10-19T07:10:00Z',
    offeredAt: '2026-10-19T07:00:00Z',
    decidedAt: '2026-10-19T07:05:00Z',
    declineReason: 'too_far',
    runner: { id: 'r1', displayName: 'Kevin Otieno', shortName: 'Kevin O.' },
    ...patch,
  };
}

function declined(patch: Partial<Errand> = {}): Errand {
  return errandFixture({
    status: 'RUNNER_ASSIGNED',
    deadlinePassed: false,
    lastAssignment: offer(),
    assignments: [offer()],
    ...patch,
  });
}

describe('decline reason labels (row 210)', () => {
  it('maps every API reason to the ops label', () => {
    expect(declineReasonLabel('over_purchase_limit')).toBe('Above their purchase limit');
    expect(declineReasonLabel('too_far')).toBe('Too far away');
    expect(declineReasonLabel('not_available')).toBe('Not available');
    expect(declineReasonLabel('other')).toBe('Other reason');
  });

  it('reads No reason given without a reason, and title-cases unknown values', () => {
    expect(declineReasonLabel(null)).toBe('No reason given');
    expect(declineReasonLabel(undefined)).toBe('No reason given');
    expect(declineReasonLabel('runner_sick')).toBe('Runner sick');
  });
});

describe('offer section state', () => {
  it('is declined for a RUNNER_ASSIGNED task whose latest offer was declined', () => {
    expect(offerSectionState(declined())).toBe('declined');
  });

  it('lets a passed deadline take precedence (row 185)', () => {
    expect(offerSectionState(declined({ deadlinePassed: true }))).toBeNull();
  });

  it('is not built for open or lapsed offers, or other states', () => {
    expect(
      offerSectionState(declined({ lastAssignment: offer({ status: 'assigned' }) })),
    ).toBeNull();
    expect(
      offerSectionState(declined({ lastAssignment: offer({ status: 'expired' }) })),
    ).toBeNull();
    expect(offerSectionState(declined({ status: 'RUNNER_EN_ROUTE' }))).toBeNull();
    expect(offerSectionState(errandFixture({ status: 'PAYMENT_CONFIRMED' }))).toBeNull();
  });
});

describe('TaskOfferSectionComponent: Declined', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    http = setupHttp();
  });
  afterEach(() => http.verify());

  function render(errand: Errand): HTMLElement {
    const fixture = TestBed.createComponent(TaskOfferSectionComponent);
    fixture.componentRef.setInput('errand', errand);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the Declined chip, times and the reason label', () => {
    const el = render(declined());
    expect(el.querySelector('.drawer-label')?.textContent).toBe('Runner');
    expect(el.querySelector('.chip')?.textContent?.trim()).toBe('Declined');
    expect(el.querySelector('.chip')?.className).toContain('chip-pending');
    const rows = Array.from(el.querySelectorAll('.drawer-row')).map((r) =>
      r.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(rows[0]).toMatch(/^Offered at/);
    expect(rows[1]).toMatch(/^Declined/);
    expect(rows[2]).toMatch(/^Reason\s*Too far away$/);
    expect(el.textContent).toContain('The task is still waiting for a runner.');
  });

  it('renders the reason in Fira Sans and the times in Fira Code', () => {
    const el = render(declined());
    const values = el.querySelectorAll('.drawer-row b');
    expect(values[0].classList.contains('txt')).toBe(false);
    expect(values[2].classList.contains('txt')).toBe(true);
  });

  it('reads No reason given for a decline without a reason', () => {
    const el = render(declined({ lastAssignment: offer({ declineReason: null }) }));
    expect(el.textContent).toContain('No reason given');
  });

  it('renders nothing when no built state applies', () => {
    const el = render(errandFixture({ status: 'PAYMENT_CONFIRMED' }));
    expect(el.querySelector('section')).toBeNull();
  });
});

describe('expire failures (rows 187, 202, 203)', () => {
  const conflict = (reason?: string, code = 'expiry_not_allowed') =>
    expireFailure({
      status: 409,
      code,
      message: 'API text that must not be shown',
      messages: [],
      extra: reason ? { reason } : {},
    });

  it('maps expiry_not_allowed reasons to spec copy, never the API message', () => {
    expect(conflict('eligible_runners_remain')).toEqual({
      kind: 'reload',
      text: 'Eligible runners are still available. Offer the task to one of them.',
    });
    expect(conflict('open_offer').text).toBe(
      'This task has an open offer. Wait for the runner to answer.',
    );
    expect(conflict('deadline_passed').text).toBe(
      'The deadline has passed, so this task expires automatically.',
    );
    expect(conflict('not_runner_assigned').text).toBe(TASK_CHANGED);
    expect(conflict(undefined).text).toBe(TASK_CHANGED);
  });

  it('reloads on illegal_transition, marks the field on 400, and maps 403 and others', () => {
    expect(conflict(undefined, 'illegal_transition')).toEqual({
      kind: 'reload',
      text: TASK_CHANGED,
    });
    expect(
      expireFailure({
        status: 400,
        code: 'expiry_reason_invalid',
        message: '',
        messages: [],
        extra: {},
      }),
    ).toEqual({ kind: 'field', text: 'Give a reason (10–500 characters).' });
    expect(expireFailure({ status: 403, message: '', messages: [], extra: {} })).toEqual({
      kind: 'dialog',
      text: FORBIDDEN_COPY,
    });
    expect(expireFailure({ status: 500, message: '', messages: [], extra: {} })).toEqual({
      kind: 'dialog',
      text: "Couldn't expire the task. Try again.",
    });
  });
});

describe('TaskOfferSectionComponent: expire and Expired by ops', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    http = setupHttp();
  });
  afterEach(() => http.verify());

  const ID = errandFixture().id;

  function create(errand: Errand) {
    const fixture = TestBed.createComponent(TaskOfferSectionComponent);
    fixture.componentRef.setInput('errand', errand);
    const notices: { tone: string; text: string }[] = [];
    fixture.componentInstance.notice.subscribe((n) => notices.push(n));
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, notices };
  }

  function buttons(el: HTMLElement, label: string): HTMLButtonElement[] {
    return Array.from(el.querySelectorAll<HTMLButtonElement>('button')).filter(
      (b) => b.textContent?.trim() === label,
    );
  }

  function type(el: HTMLElement, text: string): HTMLTextAreaElement {
    const ta = el.querySelector('textarea') as HTMLTextAreaElement;
    ta.value = text;
    ta.dispatchEvent(new Event('input'));
    return ta;
  }

  const expirable = () => declined({ canExpire: { noRunner: true, deadlinePassed: false } });

  it('shows Expire task — no runner available only when canExpire.noRunner', () => {
    expect(buttons(create(expirable()).el, 'Expire task — no runner available')).toHaveLength(1);
    expect(buttons(create(declined()).el, 'Expire task — no runner available')).toHaveLength(0);
    expect(
      buttons(
        create(
          errandFixture({
            status: 'PAYMENT_CONFIRMED',
            canExpire: { noRunner: true, deadlinePassed: false },
          }),
        ).el,
        'Expire task — no runner available',
      ),
    ).toHaveLength(0);
  });

  it('opens the confirm with the spec body and keeps Expire task off under 10 characters', async () => {
    const { fixture, el } = create(expirable());
    buttons(el, 'Expire task — no runner available')[0].click();
    fixture.detectChanges();
    expect(el.querySelector('[role="dialog"] h3')?.textContent).toBe('Expire this task?');
    expect(el.textContent).toContain(
      "No runner is available for Buy groceries at Naivas. The task moves to Expired and can't be offered again. The customer is told no runner was available. A refund review opens because the task was paid.",
    );
    expect(el.textContent).toContain(
      "Kept in the task history for audit. The customer and runners don't see it.",
    );
    const confirm = buttons(el, 'Expire task')[0];
    expect(confirm.disabled).toBe(true);
    const ta = type(el, '   short   ');
    ta.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(confirm.disabled).toBe(true);
    expect(el.querySelector('.field-error')?.textContent).toBe('Enter at least 10 characters.');
    expect(el.querySelector('.field-counter')?.textContent).toBe('11/500');
    type(el, 'No runner online in Kilimani');
    fixture.detectChanges();
    expect(confirm.disabled).toBe(false);
    expect(el.querySelector('.field-error')).toBeNull();
  });

  it('posts the trimmed reason, closes, reloads and reports Task expired.', async () => {
    const { fixture, el, notices } = create(expirable());
    buttons(el, 'Expire task — no runner available')[0].click();
    fixture.detectChanges();
    type(el, '  No runner online in Kilimani  ');
    fixture.detectChanges();
    buttons(el, 'Expire task')[0].click();
    const req = http.expectOne(`${API}/errands/${ID}/expire`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ reason: 'No runner online in Kilimani' });
    req.flush({
      errand: errandFixture({ status: 'EXPIRED' }),
      history: {
        id: 'h9',
        errandId: ID,
        fromStatus: 'RUNNER_ASSIGNED',
        toStatus: 'EXPIRED',
        actorType: 'admin',
        createdAt: '2026-10-19T09:00:00Z',
      },
    });
    await flushAsync();
    http.expectOne(`${API}/errands/${ID}`).flush(errandFixture({ status: 'EXPIRED' }));
    http.expectOne(`${API}/errands/${ID}/history`).flush([]);
    await flushAsync();
    fixture.detectChanges();
    expect(notices).toEqual([{ tone: 'success', text: 'Task expired.' }]);
    expect(el.querySelector('[role="dialog"]')).toBeNull();
  });

  it('closes, reloads and shows the refusal copy on 409 expiry_not_allowed', async () => {
    const { fixture, el, notices } = create(expirable());
    buttons(el, 'Expire task — no runner available')[0].click();
    fixture.detectChanges();
    type(el, 'No runner online in Kilimani');
    fixture.detectChanges();
    buttons(el, 'Expire task')[0].click();
    http.expectOne(`${API}/errands/${ID}/expire`).flush(
      {
        statusCode: 409,
        code: 'expiry_not_allowed',
        message: 'Eligible runners are still available. Offer the task to one of them',
        reason: 'eligible_runners_remain',
        eligibleRemaining: 2,
      },
      { status: 409, statusText: 'Conflict' },
    );
    await flushAsync();
    http.expectOne(`${API}/errands/${ID}`).flush(expirable());
    http.expectOne(`${API}/errands/${ID}/history`).flush([]);
    await flushAsync();
    fixture.detectChanges();
    expect(el.querySelector('[role="dialog"]')).toBeNull();
    expect(notices).toEqual([
      {
        tone: 'info',
        text: 'Eligible runners are still available. Offer the task to one of them.',
      },
    ]);
  });

  it('keeps the dialog open with the field error on 400 expiry_reason_invalid', async () => {
    const { fixture, el, notices } = create(expirable());
    buttons(el, 'Expire task — no runner available')[0].click();
    fixture.detectChanges();
    type(el, 'No runner online in Kilimani');
    fixture.detectChanges();
    buttons(el, 'Expire task')[0].click();
    http
      .expectOne(`${API}/errands/${ID}/expire`)
      .flush(
        { statusCode: 400, code: 'expiry_reason_invalid', message: 'x' },
        { status: 400, statusText: 'Bad Request' },
      );
    await flushAsync();
    fixture.detectChanges();
    expect(el.querySelector('[role="dialog"]')).not.toBeNull();
    expect(el.querySelector('.field-error')?.textContent).toBe(
      'Give a reason (10–500 characters).',
    );
    expect(notices).toEqual([]);
  });

  it('shows the Expired by ops state with the admin, reason, runners tried and refund link', async () => {
    const { fixture, el } = create(
      errandFixture({
        status: 'EXPIRED',
        assignments: [offer(), offer({ id: 'a0', status: 'expired', declineReason: null })],
        expiry: {
          trigger: 'admin',
          fromStatus: 'RUNNER_ASSIGNED',
          at: '2026-10-19T09:00:00Z',
          by: { id: 'u1', displayName: 'Wanjiru K.' },
          note: 'No runner online in Kilimani',
        },
      }),
    );
    http.expectOne(`${API}/errands/${ID}/refunds`).flush({
      items: [
        {
          id: 'rv1',
          errandId: ID,
          trigger: 'expired_after_payment',
          status: 'pending_review',
          amountPaid: '1450.00',
          refundAmount: null,
          createdAt: '2026-10-19T09:00:00Z',
        },
      ],
    });
    await flushAsync();
    fixture.detectChanges();
    const chip = el.querySelector('.chip');
    expect(chip?.textContent?.trim()).toBe('Expired by ops');
    expect(chip?.className).toContain('chip-info');
    const text = el.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(text).toContain('Expired by');
    expect(text).toContain('Wanjiru K.');
    expect(text).toContain('No runner online in Kilimani');
    expect(text).toMatch(/Runners tried\s*2/);
    expect(text).toContain('An admin expired this task because no runner was available.');
    expect(text).toContain('A refund review was opened.');
    expect(buttons(el, 'Expire task — no runner available')).toHaveLength(0);
    const nav = TestBed.inject(DrawerNavService);
    const spy = vi.spyOn(nav, 'open');
    buttons(el, 'View refund review')[0].click();
    expect(spy).toHaveBeenCalledWith('refund', 'rv1');
  });

  it('does not use the Expired by ops state for system or deadline expiries', () => {
    const base = {
      at: '2026-10-19T09:00:00Z',
      by: null,
      note: null,
      fromStatus: 'RUNNER_ASSIGNED',
    };
    expect(
      offerSectionState(
        errandFixture({ status: 'EXPIRED', expiry: { ...base, trigger: 'system' } }),
      ),
    ).toBeNull();
    expect(
      offerSectionState(
        errandFixture({ status: 'EXPIRED', expiry: { ...base, trigger: 'deadline_passed' } }),
      ),
    ).toBeNull();
    expect(
      offerSectionState(
        errandFixture({
          status: 'EXPIRED',
          expiry: { ...base, trigger: 'admin', fromStatus: 'PAYMENT_CONFIRMED' },
        }),
      ),
    ).toBeNull();
  });
});
