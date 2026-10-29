import { TestBed } from '@angular/core/testing';
import { StatusChipComponent, statusLabel, statusVariant } from './status-chip.component';

describe('status chip vocabularies (A-02)', () => {
  it('maps refund statuses to the admin next-action labels', () => {
    expect(statusLabel('pending_review', 'refund')).toBe('Needs review');
    expect(statusVariant('pending_review', 'refund')).toBe('pending');
    expect(statusLabel('approved', 'refund')).toBe('Payout due');
    expect(statusVariant('approved', 'refund')).toBe('pending');
    expect(statusLabel('refunded', 'refund')).toBe('Refunded');
    expect(statusVariant('refunded', 'refund')).toBe('success');
    expect(statusLabel('no_refund', 'refund')).toBe('No refund');
    expect(statusVariant('no_refund', 'refund')).toBe('neutral');
  });

  it('keeps verification "approved" separate from refund "approved"', () => {
    expect(statusLabel('approved', 'verification')).toBe('Approved');
    expect(statusVariant('approved', 'verification')).toBe('success');
  });

  it('keeps the errand labels unchanged', () => {
    expect(statusLabel('PAYMENT_CONFIRMED')).toBe('Paid');
    expect(statusLabel('DISPUTED')).toBe('Disputed');
    expect(statusVariant('COMPLETED')).toBe('success');
  });

  it('maps availability and level', () => {
    expect(statusLabel('busy', 'availability')).toBe('On task');
    expect(statusLabel('2_id_verified', 'level')).toBe('Level 2 · ID verified');
    expect(statusVariant('2_id_verified', 'level')).toBe('info');
  });

  it('title-cases unknown values instead of hiding them', () => {
    expect(statusLabel('price_change_whatever', 'refund')).toBe('Price Change Whatever');
    expect(statusLabel(null)).toBe('Unknown');
  });
});

describe('StatusChipComponent', () => {
  it('renders a refund chip by kind', () => {
    const fixture = TestBed.createComponent(StatusChipComponent);
    fixture.componentRef.setInput('status', 'approved');
    fixture.componentRef.setInput('kind', 'refund');
    fixture.detectChanges();
    const chip = fixture.nativeElement.querySelector('.chip') as HTMLElement;
    expect(chip.textContent?.trim()).toBe('Payout due');
    expect(chip.classList).toContain('chip-pending');
  });

  it('renders a fixed flag chip without a status lookup', () => {
    const fixture = TestBed.createComponent(StatusChipComponent);
    fixture.componentRef.setInput('label', 'Quote expired');
    fixture.componentRef.setInput('tone', 'pending');
    fixture.detectChanges();
    const chip = fixture.nativeElement.querySelector('.chip') as HTMLElement;
    expect(chip.textContent?.trim()).toBe('Quote expired');
    expect(chip.classList).toContain('chip-pending');
  });

  it('renders the Pings stopped flag amber at chip size only (#36)', () => {
    const fixture = TestBed.createComponent(StatusChipComponent);
    fixture.componentRef.setInput('label', 'Pings stopped');
    fixture.componentRef.setInput('tone', 'pending');
    fixture.detectChanges();
    const chip = fixture.nativeElement.querySelector('.chip') as HTMLElement;
    expect(chip.textContent?.trim()).toBe('Pings stopped');
    expect(chip.className).toBe('chip chip-pending');
  });

  it('renders the Web marker neutral (#36)', () => {
    const fixture = TestBed.createComponent(StatusChipComponent);
    fixture.componentRef.setInput('label', 'Web');
    fixture.componentRef.setInput('tone', 'neutral');
    fixture.detectChanges();
    const chip = fixture.nativeElement.querySelector('.chip') as HTMLElement;
    expect(chip.className).toBe('chip chip-neutral');
  });
});

describe('account chip (issue #24, spec §4, owner SQ-1)', () => {
  const cases: [string, string, string][] = [
    ['active', 'Active', 'chip-info'],
    ['suspended', 'Suspended', 'chip-pending'],
    ['banned', 'Banned', 'chip-danger'],
  ];

  for (const [status, label, cls] of cases) {
    it(`renders ${status} as ${label} with ${cls}`, () => {
      const fixture = TestBed.createComponent(StatusChipComponent);
      fixture.componentRef.setInput('status', status);
      fixture.componentRef.setInput('kind', 'account');
      fixture.detectChanges();
      const chip = fixture.nativeElement.querySelector('.chip') as HTMLElement;
      expect(chip.textContent?.trim()).toBe(label);
      expect(chip.classList).toContain(cls);
      expect(chip.classList).not.toContain('chip-success');
    });
  }
});
