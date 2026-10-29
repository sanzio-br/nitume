import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { accessibleText } from '../../../../testing/css';
import {
  ERRAND_STATUSES,
  ErrandStatus,
  StatusTone,
  customerStatus,
  customerTimelineTitle,
  parseErrandStatus,
  runnerStatus,
} from '../../status/status-presentation';
import { NmStatusChip, NmStatusChipSize } from './status-chip.component';
import { NmTag } from './tag.component';

/** §4.2.3, verbatim. */
const CUSTOMER_TABLE: Record<ErrandStatus, [string, StatusTone]> = {
  DRAFT: ['Draft', 'info'],
  REQUESTED: ['Awaiting quote', 'pending'],
  QUOTED: ['Quote ready', 'pending'],
  ACCEPTED: ['Awaiting payment', 'pending'],
  PAYMENT_CONFIRMED: ['Finding a runner', 'info'],
  RUNNER_ASSIGNED: ['Finding a runner', 'info'],
  RUNNER_EN_ROUTE: ['En route', 'pending'],
  ARRIVED: ['Arrived', 'info'],
  IN_PROGRESS: ['In progress', 'info'],
  AWAITING_CUSTOMER: ['Needs your review', 'pending'],
  COMPLETED: ['Completed', 'success'],
  CONFIRMED: ['Completed', 'success'],
  SETTLED: ['Completed', 'success'],
  CANCELLED: ['Cancelled', 'danger'],
  FAILED: ['Failed', 'danger'],
  EXPIRED: ['Expired', 'info'],
  DISPUTED: ['Disputed', 'danger'],
};

/** §4.2.4, verbatim (offerAccepted defaults to true). */
const RUNNER_TABLE: Record<ErrandStatus, [string, StatusTone] | null> = {
  DRAFT: null,
  REQUESTED: null,
  QUOTED: null,
  ACCEPTED: null,
  PAYMENT_CONFIRMED: ['New offer', 'info'],
  RUNNER_ASSIGNED: ['Accepted', 'info'],
  RUNNER_EN_ROUTE: ['On the way', 'pending'],
  ARRIVED: ['Arrived', 'info'],
  IN_PROGRESS: ['In progress', 'info'],
  AWAITING_CUSTOMER: ['Waiting for the customer', 'pending'],
  COMPLETED: ['Completed', 'success'],
  CONFIRMED: ['Completed', 'success'],
  SETTLED: ['Paid', 'success'],
  CANCELLED: ['Cancelled', 'danger'],
  FAILED: ['Failed', 'danger'],
  EXPIRED: ['Expired', 'info'],
  DISPUTED: ['Disputed', 'danger'],
};

@Component({
  imports: [NmStatusChip],
  template: `
    <nm-status-chip
      [label]="label()"
      [tone]="tone()"
      [size]="size()"
      [showDot]="showDot()"
      [numericSuffix]="suffix()"
      [customerStatus]="customer()"
      [runnerStatus]="runner()"
      [offerAccepted]="offerAccepted()"
    />
  `,
})
class Host {
  readonly label = signal<string | null>(null);
  readonly tone = signal<StatusTone | null>(null);
  readonly size = signal<NmStatusChipSize>('regular');
  readonly showDot = signal<boolean | undefined>(undefined);
  readonly suffix = signal<string | null>(null);
  readonly customer = signal<ErrandStatus | null | undefined>(undefined);
  readonly runner = signal<ErrandStatus | null | undefined>(undefined);
  readonly offerAccepted = signal(true);
}

function setup() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const host = fixture.componentInstance;
  const root = fixture.nativeElement.querySelector('nm-status-chip') as HTMLElement;
  return {
    host,
    root,
    update: () => fixture.detectChanges(),
    chip: () => root.querySelector('.nm-chip') as HTMLElement | null,
    dot: () => root.querySelector('.nm-chip__dot') as HTMLElement | null,
    label: () => (root.querySelector('.nm-chip__label')?.firstChild?.textContent ?? '').trim(),
  };
}

describe('status chip and tag (§12.3)', () => {
  it('10. customer map: every §3.3 state has the §4.2.3 label and tone, rendered by the chip', () => {
    expect(ERRAND_STATUSES).toHaveLength(17);
    expect(Object.keys(CUSTOMER_TABLE)).toEqual([...ERRAND_STATUSES]);
    const { host, update, chip, label } = setup();
    for (const status of ERRAND_STATUSES) {
      const [wantLabel, wantTone] = CUSTOMER_TABLE[status];
      expect.soft(customerStatus(status), status).toEqual({ label: wantLabel, tone: wantTone });
      host.customer.set(status);
      update();
      expect.soft(label(), `${status} chip label`).toBe(wantLabel);
      expect.soft(chip()?.classList.contains(`nm-chip--${wantTone}`), `${status} chip tone`).toBe(true);
    }
  });

  it('11. runner map: every §3.3 state plus RUNNER_ASSIGNED with offerAccepted false; pre-offer states render nothing', () => {
    const { host, update, chip, label, root } = setup();
    for (const status of ERRAND_STATUSES) {
      const want = RUNNER_TABLE[status];
      const got = runnerStatus(status);
      expect.soft(got, status).toEqual(want ? { label: want[0], tone: want[1] } : null);
      host.runner.set(status);
      update();
      if (want) {
        expect.soft(label(), `${status} chip label`).toBe(want[0]);
        expect.soft(chip()?.classList.contains(`nm-chip--${want[1]}`), `${status} tone`).toBe(true);
      } else {
        expect.soft(chip(), `${status} renders nothing`).toBeNull();
        expect.soft(root.children.length, `${status} empty host`).toBe(0);
      }
    }
    expect(runnerStatus('RUNNER_ASSIGNED', { offerAccepted: false })).toEqual({
      label: 'New offer',
      tone: 'info',
    });
    host.runner.set('RUNNER_ASSIGNED');
    host.offerAccepted.set(false);
    update();
    expect(label()).toBe('New offer');
    // No admin labels anywhere in either map.
    const all = ERRAND_STATUSES.flatMap((s) => [customerStatus(s).label, runnerStatus(s)?.label]);
    for (const admin of 'Assigned Confirmed Settled'.split(' ')) expect(all).not.toContain(admin);
  });

  it('12. customerTimelineTitle: RUNNER_ASSIGNED null, RUNNER_EN_ROUTE "Runner assigned", others their label', () => {
    for (const status of ERRAND_STATUSES) {
      const title = customerTimelineTitle(status);
      if (status === 'RUNNER_ASSIGNED') expect(title).toBeNull();
      else if (status === 'RUNNER_EN_ROUTE') expect(title).toBe('Runner assigned');
      else expect.soft(title, status).toBe(CUSTOMER_TABLE[status][0]);
    }
  });

  it('13. high contrast (row 33): blue labels on every tint; dots carry the tone colour', () => {
    const { host, update, chip, dot } = setup();
    const want: Record<StatusTone, [string, string]> = {
      success: ['var(--nitume-green-050)', 'var(--nitume-green-700)'],
      pending: ['var(--nitume-amber-050)', 'var(--nitume-amber)'],
      danger: ['var(--nitume-red-050)', 'var(--nitume-red)'],
      info: ['var(--nitume-blue-050)', 'var(--nitume-blue)'],
    };
    host.label.set('Label');
    for (const tone of Object.keys(want) as StatusTone[]) {
      host.tone.set(tone);
      update();
      const cs = getComputedStyle(chip()!);
      expect.soft(cs.color, `${tone} label`).toBe('var(--nitume-blue)');
      expect.soft(cs.backgroundColor, `${tone} tint`).toBe(want[tone][0]);
      expect.soft(getComputedStyle(dot()!).backgroundColor, `${tone} dot`).toBe(want[tone][1]);
    }
  });

  it('14. sizes: regular shows the dot, compact and tag do not; showDot overrides', () => {
    const { host, update, chip, dot } = setup();
    host.label.set('Default');
    host.tone.set('info');
    update();
    expect(dot()).not.toBeNull();
    expect(getComputedStyle(chip()!).paddingTop).toBe('5px');
    expect(getComputedStyle(chip()!).fontSize).toBe('12px');

    host.size.set('compact');
    update();
    expect(dot()).toBeNull();
    expect(getComputedStyle(chip()!).fontSize).toBe('11px');
    expect(getComputedStyle(chip()!).fontWeight).toBe('700');
    expect(getComputedStyle(chip()!).paddingTop).toBe('4px');

    host.size.set('tag');
    update();
    expect(dot()).toBeNull();
    expect(getComputedStyle(chip()!).fontSize).toBe('10px');
    expect(getComputedStyle(chip()!).paddingTop).toBe('3px');

    host.showDot.set(true);
    update();
    expect(dot()).not.toBeNull();
    host.size.set('regular');
    host.showDot.set(false);
    update();
    expect(dot()).toBeNull();
  });

  it('15. numericSuffix renders after " · " in an nmNum element; accessible text is "label suffix"', () => {
    const { host, update, chip } = setup();
    host.label.set('Check It For Me');
    host.tone.set('info');
    host.suffix.set('#NT-10482');
    update();
    const num = chip()!.querySelector('[nmNum]') as HTMLElement;
    expect(num.textContent).toBe('#NT-10482');
    expect(getComputedStyle(num).fontFamily).toBe('var(--nitume-font-num)');
    expect(chip()!.textContent!.replace(/\s+/g, ' ').trim()).toBe('Check It For Me · #NT-10482');
    expect(chip()!.querySelector('.nm-chip__sep')?.getAttribute('aria-hidden')).toBe('true');
    expect(chip()!.querySelector('.nm-chip__dot')?.getAttribute('aria-hidden')).toBe('true');
    expect(accessibleText(chip()!)).toBe('Check It For Me #NT-10482');
    // Not interactive.
    expect(chip()!.tagName).toBe('SPAN');
    expect(chip()!.hasAttribute('tabindex')).toBe(false);
  });

  it('16. an unknown status string gives no chip (parser returns null)', () => {
    expect(parseErrandStatus('ON_HOLD')).toBeNull();
    expect(parseErrandStatus(42)).toBeNull();
    expect(parseErrandStatus('EXPIRED')).toBe('EXPIRED');
    const { host, update, chip } = setup();
    host.customer.set(parseErrandStatus('ON_HOLD'));
    update();
    expect(chip()).toBeNull();
    host.customer.set(undefined);
    host.runner.set(parseErrandStatus('SOMETHING_NEW'));
    update();
    expect(chip()).toBeNull();
  });

  it('17. nm-tag: blue on blue-050, no dot, not focusable', () => {
    @Component({ imports: [NmTag], template: `<nm-tag label="Buy For Me" />` })
    class TagHost {}
    const fixture = TestBed.createComponent(TagHost);
    fixture.detectChanges();
    const tag = fixture.nativeElement.querySelector('.nm-tag') as HTMLElement;
    const cs = getComputedStyle(tag);
    expect(tag.textContent).toBe('Buy For Me');
    expect(cs.color).toBe('var(--nitume-blue)');
    expect(cs.backgroundColor).toBe('var(--nitume-blue-050)');
    expect(cs.fontSize).toBe('11px');
    expect(cs.fontWeight).toBe('600');
    expect(cs.paddingTop).toBe('6px');
    expect(cs.paddingLeft).toBe('11px');
    expect(cs.borderRadius).toBe('var(--nitume-r-pill)');
    expect(tag.querySelector('.nm-chip__dot')).toBeNull();
    expect(tag.children.length).toBe(0);
    expect(tag.tabIndex).toBe(-1);
    expect(tag.hasAttribute('tabindex')).toBe(false);
  });
});
