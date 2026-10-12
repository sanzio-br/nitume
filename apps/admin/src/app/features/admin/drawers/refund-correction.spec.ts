import {
  CORRECTION_AMOUNT_FORMAT,
  CORRECTION_CODE_ERROR,
  CORRECTION_NEED_ONE,
  CORRECTION_REASON_ERROR,
  CORRECTION_SAME_AMOUNT,
  CORRECTION_SAME_RECEIPT,
  CorrectionForm,
  correctionBody,
  correctionDialogBody,
  correctionDialogParts,
  correctionDialogTitle,
  validateCorrection,
} from './refund-correction';

const ctx = { reference: 'SLK4H7XQ2P', amount: '1200.00', ceiling: '1200.00' };
const form = (patch: Partial<CorrectionForm> = {}): CorrectionForm => ({
  kind: 'corrected',
  reference: '',
  amount: '',
  reason: 'Typed it wrong',
  ...patch,
});

describe('payout correction rules (row 100)', () => {
  it('corrected needs a receipt, an amount or both, each different from the record', () => {
    expect(validateCorrection(form(), ctx).form).toBe(CORRECTION_NEED_ONE);
    expect(validateCorrection(form({ reference: 'slk4h7xq2p' }), ctx).reference).toBe(
      CORRECTION_SAME_RECEIPT,
    );
    expect(validateCorrection(form({ amount: '1,200' }), ctx).amount).toBe(CORRECTION_SAME_AMOUNT);
    const ok = validateCorrection(form({ reference: 'SLK4H7XQ2Q', amount: '1100' }), ctx);
    expect(ok).toEqual({ reference: null, amount: null, reason: null, form: null });
  });

  it('checks the code pattern, the amount format and the ceiling', () => {
    expect(validateCorrection(form({ reference: 'AB 12' }), ctx).reference).toBe(
      CORRECTION_CODE_ERROR,
    );
    expect(validateCorrection(form({ amount: '0' }), ctx).amount).toBe(CORRECTION_AMOUNT_FORMAT);
    expect(validateCorrection(form({ amount: '10.555' }), ctx).amount).toBe(
      CORRECTION_AMOUNT_FORMAT,
    );
    expect(validateCorrection(form({ amount: '1200.01' }), ctx).amount).toBe(
      "The amount can't be more than KSh 1,200 for this review.",
    );
  });

  it('reversed and resent require the code; resent requires the amount', () => {
    expect(validateCorrection(form({ kind: 'reversed' }), ctx).reference).toBe(
      CORRECTION_CODE_ERROR,
    );
    expect(validateCorrection(form({ kind: 'reversed', amount: 'x' }), ctx).amount).toBeNull();
    const resent = validateCorrection(form({ kind: 'resent' }), { ...ctx, reference: null });
    expect(resent.reference).toBe(CORRECTION_CODE_ERROR);
    expect(resent.amount).toBe(CORRECTION_AMOUNT_FORMAT);
    // A re-sent payout may repeat the amount; only `corrected` must change it.
    expect(
      validateCorrection(form({ kind: 'resent', reference: 'NEW8P3Q2RS', amount: '1200' }), ctx),
    ).toEqual({ reference: null, amount: null, reason: null, form: null });
  });

  it('requires a 5–500 character reason after trimming', () => {
    expect(validateCorrection(form({ reason: '  abc  ' }), ctx).reason).toBe(
      CORRECTION_REASON_ERROR,
    );
    expect(validateCorrection(form({ reason: 'x'.repeat(501) }), ctx).reason).toBe(
      CORRECTION_REASON_ERROR,
    );
    expect(validateCorrection(form({ reason: 'abcde' }), ctx).reason).toBeNull();
  });

  it('sends only what the kind uses, upper-cased, with the expected latest id', () => {
    expect(correctionBody(form({ reference: ' slk4h7xq2q ', reason: ' why? ok ' }), null)).toEqual({
      kind: 'corrected',
      newReference: 'SLK4H7XQ2Q',
      reason: 'why? ok',
      expectedLatestCorrectionId: null,
    });
    expect(correctionBody(form({ amount: '1,100.50' }), 'c1')).toEqual({
      kind: 'corrected',
      newAmount: 1100.5,
      reason: 'Typed it wrong',
      expectedLatestCorrectionId: 'c1',
    });
    expect(
      correctionBody(form({ kind: 'reversed', reference: 'rvs9k2l1mx', amount: '5' }), 'c1'),
    ).toEqual({
      kind: 'reversed',
      newReference: 'RVS9K2L1MX',
      reason: 'Typed it wrong',
      expectedLatestCorrectionId: 'c1',
    });
  });

  it('makes every receipt and amount its own Fira Code part, even short or all-letter codes (m-11)', () => {
    const nums = (f: CorrectionForm) =>
      correctionDialogParts(f)
        .filter((p) => p.num)
        .map((p) => p.text);
    expect(nums(form({ reference: 'ab12', amount: '1100' }))).toEqual(['AB12', 'KSh 1,100']);
    expect(nums(form({ kind: 'reversed', reference: 'REVERSAL' }))).toEqual(['REVERSAL']);
    expect(nums(form({ kind: 'resent', reference: 'abcd', amount: '1200' }))).toEqual(['ABCD']);
  });

  it('words the confirm dialogs per kind', () => {
    const corrected = form({ reference: 'slk4h7xq2q', amount: '1100' });
    expect(correctionDialogTitle(corrected)).toBe('Save this correction?');
    expect(correctionDialogBody(corrected)).toBe(
      "The original payout record stays as it is. This correction is added to the history and can't be edited or deleted. New receipt SLK4H7XQ2Q. Amount sent KSh 1,100.",
    );
    const reversed = form({ kind: 'reversed', reference: 'RVS9K2L1MX' });
    expect(correctionDialogTitle(reversed)).toBe('Record that this payout was reversed?');
    expect(correctionDialogBody(reversed)).toBe(
      "Reversal code RVS9K2L1MX. The refund will show as not sent until you record a new payout. This can't be edited or deleted.",
    );
    const resent = form({ kind: 'resent', reference: 'NEW8P3Q2RS', amount: '1200' });
    expect(correctionDialogTitle(resent)).toBe('Record a new payout of KSh 1,200?');
    expect(correctionDialogBody(resent)).toBe(
      "M-Pesa receipt NEW8P3Q2RS. The customer will be told the refund has been sent. This can't be edited or deleted.",
    );
  });
});
