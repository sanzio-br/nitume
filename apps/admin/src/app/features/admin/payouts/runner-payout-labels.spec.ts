import {
  payoutTaskRef,
  reviewReasonLabel,
  runnerName,
  runnerPayoutAmount,
  runnerPayoutChipStatus,
  runnerPayoutKindLabel,
  runnerPayoutRowAction,
  toCorrectionRecord,
} from './runner-payout-labels';
import { statusLabel, statusVariant } from '../../../shared/status-chip.component';

const reversed = { state: 'reversed' as const, amount: '0.00', reference: null, at: null };
const sent = { state: 'sent' as const, amount: '900.00', reference: 'SLK4H7XQ2P', at: null };

describe('runner payout vocabulary (_shared.md §6.1)', () => {
  it('chip labels and tones by effective status', () => {
    const chip = (s: string) => [
      statusLabel(s, 'runner_payout'),
      statusVariant(s, 'runner_payout'),
    ];
    expect(chip('on_hold')).toEqual(['Needs review', 'pending']);
    expect(chip('payable')).toEqual(['Payout due', 'pending']);
    expect(chip('payout_reversed')).toEqual(['Payout reversed', 'pending']);
    expect(chip('paid')).toEqual(['Paid', 'success']);
    expect(chip('rejected')).toEqual(['Not approved', 'neutral']);
    expect(chip('frozen_somehow')).toEqual(['Frozen Somehow', 'neutral']);
  });

  it('a reversed payout reads Payout reversed and is re-sent, not reviewed or viewed', () => {
    const line = { effectiveStatus: 'payable', effectivePayout: reversed };
    expect(runnerPayoutChipStatus(line)).toBe('payout_reversed');
    expect(runnerPayoutRowAction(line)).toBe('Re-send');
    expect(runnerPayoutRowAction({ effectiveStatus: 'on_hold', effectivePayout: null })).toBe(
      'Review',
    );
    expect(runnerPayoutRowAction({ effectiveStatus: 'payable', effectivePayout: null })).toBe(
      'View',
    );
    expect(runnerPayoutChipStatus({ effectiveStatus: 'paid', effectivePayout: sent })).toBe('paid');
  });

  it('kind, reason, runner, task reference and amount labels', () => {
    expect(runnerPayoutKindLabel('runner_fee')).toBe('Runner fee');
    expect(runnerPayoutKindLabel('item_reimbursement')).toBe('Item reimbursement');
    expect(reviewReasonLabel('out_of_pocket_claim')).toBe('Claim after cancel/fail');
    expect(reviewReasonLabel('over_purchase_limit')).toBe('Above purchase limit');
    expect(reviewReasonLabel('new_reason')).toBe('New Reason');
    expect(runnerName({ shortName: null, displayName: 'Brian O.' }, 'x')).toBe('Brian O.');
    expect(runnerName(null, 'rrrrrrrr-0000-0000-0000-00000000ab12')).toBe('Runner …ab12');
    expect(
      payoutTaskRef({
        errandId: 'e',
        errand: { id: 'e', reference: 'NT-10482', title: null, category: 'x', status: 'CONFIRMED' },
      }),
    ).toBe('#NT-10482');
    expect(runnerPayoutAmount({ amount: null, requestedAmount: '4000.00' })).toEqual({
      value: '4000.00',
      requested: true,
    });
  });

  it('maps adjustment kinds to the shared correction card', () => {
    const base = {
      id: 'c1',
      previousReference: 'A',
      previousAmount: '1.00',
      newReference: 'B',
      newAmount: null,
      reason: 'r',
      createdByUserId: null,
      createdBy: null,
      createdAt: '2026-10-13T06:00:00Z',
    };
    expect(toCorrectionRecord({ ...base, kind: 'resent_payout' }).kind).toBe('resent');
    expect(toCorrectionRecord({ ...base, kind: 'reversal' }).kind).toBe('reversed');
    expect(toCorrectionRecord({ ...base, kind: 'other' }).kind).toBe('other');
  });
});
