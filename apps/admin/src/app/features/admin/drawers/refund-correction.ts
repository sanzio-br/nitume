import type { CreateRefundCorrectionDto, RefundCorrectionKind } from '../../../core/api-types';
import { formatKshExact, isBlank, parseKsh } from '../shared-format';

/**
 * Payout correction form logic (row 100, drawer-refund "Corrections"):
 * validation, request body and copy. Pure, so the drawer stays thin and
 * every rule is unit-tested.
 */

export const CORRECTION_CODE_ERROR = 'Enter the M-Pesa code, letters and numbers only.';
export const CORRECTION_SAME_RECEIPT = 'This is already the receipt on record.';
export const CORRECTION_AMOUNT_FORMAT = 'Enter an amount in KSh, up to 2 decimal places.';
export const CORRECTION_SAME_AMOUNT = 'This is already the amount on record.';
export const CORRECTION_NEED_ONE = 'Enter the correct receipt, the correct amount, or both.';
export const CORRECTION_REASON_ERROR = "Say why you're making this change.";
export const CORRECTION_NO_CHANGE = 'Nothing to correct: the receipt and amount match the record.';
export const CORRECTION_REFERENCE_REUSED = 'This M-Pesa code is already recorded on a payout.';
export const CORRECTION_REASON_MAX = 500;
const CORRECTION_REASON_MIN = 5;
const CODE_PATTERN = /^[A-Za-z0-9-]{4,64}$/;

export function correctionCeilingError(ceiling: string | number | null): string {
  return `The amount can't be more than ${formatKshExact(ceiling)} for this review.`;
}

/** What the admin typed. */
export interface CorrectionForm {
  kind: RefundCorrectionKind;
  reference: string;
  amount: string;
  reason: string;
}

/** The effective payout the form corrects, and the API's `correctionCeiling`. */
export interface CorrectionContext {
  reference: string | null;
  amount: string;
  ceiling: string;
}

export interface CorrectionErrors {
  reference: string | null;
  amount: string | null;
  reason: string | null;
  /** Form-level, under the receipt and amount fields (`corrected`). */
  form: string | null;
}

const cents = (value: string | number) => Math.round(Number(value) * 100);

/** Client rules (drawer-refund "Validation (corrections)"), mirroring the API. */
export function validateCorrection(f: CorrectionForm, ctx: CorrectionContext): CorrectionErrors {
  const errors: CorrectionErrors = { reference: null, amount: null, reason: null, form: null };
  const reference = f.reference.trim();
  if (isBlank(reference)) {
    if (f.kind !== 'corrected') errors.reference = CORRECTION_CODE_ERROR;
  } else if (!CODE_PATTERN.test(reference)) {
    errors.reference = CORRECTION_CODE_ERROR;
  } else if (
    f.kind === 'corrected' &&
    reference.toUpperCase() === (ctx.reference ?? '').trim().toUpperCase()
  ) {
    errors.reference = CORRECTION_SAME_RECEIPT;
  }

  if (f.kind !== 'reversed') {
    if (isBlank(f.amount)) {
      if (f.kind === 'resent') errors.amount = CORRECTION_AMOUNT_FORMAT;
    } else {
      const value = parseKsh(f.amount);
      if (value === null || value <= 0) errors.amount = CORRECTION_AMOUNT_FORMAT;
      else if (cents(value) > cents(ctx.ceiling))
        errors.amount = correctionCeilingError(ctx.ceiling);
      else if (f.kind === 'corrected' && cents(value) === cents(ctx.amount))
        errors.amount = CORRECTION_SAME_AMOUNT;
    }
  }

  if (f.kind === 'corrected' && isBlank(f.reference) && isBlank(f.amount)) {
    errors.form = CORRECTION_NEED_ONE;
  }

  const reason = f.reason.trim().length;
  if (reason < CORRECTION_REASON_MIN || reason > CORRECTION_REASON_MAX) {
    errors.reason = CORRECTION_REASON_ERROR;
  }
  return errors;
}

export function hasCorrectionErrors(e: CorrectionErrors): boolean {
  return !!(e.reference || e.amount || e.reason || e.form);
}

/**
 * `POST /refunds/:id/corrections` body: only the fields the kind uses and
 * the admin filled; receipt trimmed and upper-cased, amount a JSON number.
 */
export function correctionBody(
  f: CorrectionForm,
  expectedLatestCorrectionId: string | null,
): CreateRefundCorrectionDto {
  const body: CreateRefundCorrectionDto = {
    kind: f.kind,
    reason: f.reason.trim(),
    expectedLatestCorrectionId,
  };
  const reference = f.reference.trim().toUpperCase();
  if (reference) body.newReference = reference;
  const amount = parseKsh(f.amount);
  if (f.kind !== 'reversed' && amount !== null) body.newAmount = amount;
  return body;
}

/** Primary button and dialog confirm label. */
export const CORRECTION_SUBMIT: Record<RefundCorrectionKind, string> = {
  corrected: 'Save correction',
  reversed: 'Record reversal',
  resent: 'Record new payout',
};

/** A-11 success notice after a save. */
export const CORRECTION_SAVED: Record<RefundCorrectionKind, string> = {
  corrected: 'Correction saved. The original record is unchanged.',
  reversed: 'Reversal recorded. Send the refund again and record the new payout.',
  resent: 'New payout recorded.',
};

/** A-08 confirm title. */
export function correctionDialogTitle(f: CorrectionForm): string {
  switch (f.kind) {
    case 'corrected':
      return 'Save this correction?';
    case 'reversed':
      return 'Record that this payout was reversed?';
    default:
      return `Record a new payout of ${formatKshExact(parseKsh(f.amount))}?`;
  }
}

/** A-08 confirm body (amounts and receipts are rendered in Fira Code by the caller). */
export function correctionDialogBody(f: CorrectionForm): string {
  const reference = f.reference.trim().toUpperCase();
  switch (f.kind) {
    case 'corrected': {
      const parts = [
        "The original payout record stays as it is. This correction is added to the history and can't be edited or deleted.",
      ];
      if (reference) parts.push(`New receipt ${reference}.`);
      const amount = parseKsh(f.amount);
      if (amount !== null) parts.push(`Amount sent ${formatKshExact(amount)}.`);
      return parts.join(' ');
    }
    case 'reversed':
      return `Reversal code ${reference}. The refund will show as not sent until you record a new payout. This can't be edited or deleted.`;
    default:
      return `M-Pesa receipt ${reference}. The customer will be told the refund has been sent. This can't be edited or deleted.`;
  }
}
