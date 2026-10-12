import { TestBed } from '@angular/core/testing';
import type { RefundPayoutCorrection } from '../../../core/api-types';
import { RefundCorrectionCardComponent } from './refund-correction-card';

function correction(patch: Partial<RefundPayoutCorrection> = {}): RefundPayoutCorrection {
  return {
    id: 'c1',
    kind: 'corrected',
    previousReference: 'SLK4H7XQ2P',
    previousAmount: '1200.00',
    newReference: 'SLK4H7XQ2Q',
    newAmount: null,
    reason: 'Typed the receipt wrong',
    createdByUserId: 'aaaaaaaa-0000-0000-0000-00000000beef',
    createdBy: { id: 'aaaaaaaa-0000-0000-0000-00000000beef', displayName: 'Otieno K.' },
    createdAt: '2026-10-08T09:00:00Z',
    ...patch,
  };
}

function render(c: RefundPayoutCorrection, meId: string | null = null) {
  const fixture = TestBed.createComponent(RefundCorrectionCardComponent);
  fixture.componentRef.setInput('correction', c);
  fixture.componentRef.setInput('meId', meId);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  // `Label value`: the row's label and value cells joined by one space.
  const rows = Array.from(el.querySelectorAll('.drawer-row'), (r) =>
    Array.from(r.children, (c) => (c.textContent ?? '').replace(/\s+/g, ' ').trim()).join(' '),
  );
  return { el, rows };
}

describe('RefundCorrectionCardComponent (row 100)', () => {
  it('corrected: receipt and amount as old → new, reason, recorded by', () => {
    const { el, rows } = render(correction({ newAmount: '1100.00' }));
    expect(el.querySelector('.correction-kind')?.textContent?.trim()).toBe('Payout corrected');
    expect(el.querySelector('.correction-time')?.textContent?.trim()).toMatch(
      /\d{1,2}:\d{2} [AP]M$/,
    );
    expect(rows).toEqual([
      'Receipt SLK4H7XQ2P → SLK4H7XQ2Q',
      'Amount sent KSh 1,200 → KSh 1,100',
      'Reason Typed the receipt wrong',
      'Recorded by Otieno K.',
    ]);
    // The arrow is Fira Sans inside the Fira Code values.
    expect(el.querySelector('b .drawer-arrow')?.textContent).toBe('→');
  });

  it('corrected with only a new amount has no receipt row', () => {
    const { rows } = render(correction({ newReference: null, newAmount: '1100.00' }));
    expect(rows[0]).toBe('Amount sent KSh 1,200 → KSh 1,100');
    expect(rows.some((r) => r.startsWith('Receipt'))).toBe(false);
  });

  it('reversed: the reversal receipt', () => {
    const { el, rows } = render(correction({ kind: 'reversed', newReference: 'RVS9K2L1MX' }));
    expect(el.querySelector('.correction-kind')?.textContent?.trim()).toBe('Payout reversed');
    expect(rows[0]).toBe('Reversal receipt RVS9K2L1MX');
    expect(rows).toHaveLength(3);
  });

  it('resent: the new receipt and amount; You for the signed-in admin', () => {
    const { el, rows } = render(
      correction({
        kind: 'resent',
        previousReference: null,
        previousAmount: '0.00',
        newReference: 'NEW8P3Q2RS',
        newAmount: '1200.00',
      }),
      'aaaaaaaa-0000-0000-0000-00000000beef',
    );
    expect(el.querySelector('.correction-kind')?.textContent?.trim()).toBe('New payout sent');
    expect(rows).toEqual([
      'M-Pesa receipt NEW8P3Q2RS',
      'Amount sent KSh 1,200',
      'Reason Typed the receipt wrong',
      'Recorded by You',
    ]);
  });

  it('masks an unnamed admin and has no edit, delete or undo control', () => {
    const { el, rows } = render(
      correction({ createdBy: { id: 'aaaaaaaa-0000-0000-0000-00000000beef', displayName: null } }),
    );
    expect(rows.at(-1)).toBe('Recorded by …beef');
    expect(el.querySelector('button, input, textarea, a')).toBeNull();
  });
});
