import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { errandFixture, setupHttp } from '../../../testing/admin-test-utils';
import type { Errand, ErrandAssignmentView } from '../../../core/api-types';
import { TaskOfferSectionComponent } from './task-offer.section';
import { declineReasonLabel, offerSectionState } from './task-offer';

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
