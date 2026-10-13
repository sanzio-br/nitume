import type { AdminRef } from '../../../core/api-types';
import { formatKshExact, isBlank, parseKsh } from '../shared-format';
import type { TextPart } from '../../../shared/num-text.component';

/**
 * Payout correction form logic, shared by the refund drawer (row 100,
 * drawer-refund "Corrections") and the runner payout drawer (row 107,
 * drawer-runner-payout "Corrections"): validation, request body and copy.
 * Pure, so the drawers stay thin and every rule is unit-tested.
 *
 * The form works on one kind vocabulary (`corrected | reversed | resent`,
 * the refund API's); each surface maps it to its own API kinds.
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
/** M-Pesa receipt / reversal code (API `MPESA_CODE`). */
export const MPESA_CODE_PATTERN = /^[A-Za-z0-9-]{4,64}$/;

/** Kinds of payout correction, as the form sees them. */
export type CorrectionKind = 'corrected' | 'reversed' | 'resent';

/** Surface copy: everything that differs between a refund and a runner payout. */
export interface CorrectionCopy {
  /** `review` / `line`: the ceiling message's scope. */
  scope: string;
  /** `refund` / `payout`: what shows as not sent after a reversal. */
  subject: string;
  /** `the customer` / `the runner`: who the money goes to. */
  payee: string;
  /** Caption when the payee's M-Pesa number is unknown. */
  missingPhone: string;
  /** Reason hint. */
  reasonHint: string;
  /** Confirm-dialog sentence after the re-sent receipt (may be empty). */
  resentNotice: string;
  /** A-11 success notice after a save. */
  saved: Record<CorrectionKind, string>;
  /** Card / timeline label per kind. */
  kindLabels: Record<CorrectionKind, string>;
}

/** drawer-refund copy (row 100). */
export const REFUND_CORRECTION_COPY: CorrectionCopy = {
  scope: 'review',
  subject: 'refund',
  payee: 'the customer',
  missingPhone: "Find the customer's number from the task before you send.",
  reasonHint: 'Kept in the audit history. Not shown to the customer.',
  resentNotice: ' The customer will be told the refund has been sent.',
  saved: {
    corrected: 'Correction saved. The original record is unchanged.',
    reversed: 'Reversal recorded. Send the refund again and record the new payout.',
    resent: 'New payout recorded.',
  },
  kindLabels: {
    corrected: 'Payout corrected',
    reversed: 'Payout reversed',
    resent: 'New payout sent',
  },
};

/** drawer-runner-payout copy (row 107, `_shared.md` §6.1 adjustment kinds). */
export const RUNNER_PAYOUT_CORRECTION_COPY: CorrectionCopy = {
  scope: 'line',
  subject: 'payout',
  payee: 'the runner',
  missingPhone: "Find the runner's number in their profile before you send.",
  reasonHint: 'Kept in the audit history. Not shown to the runner.',
  resentNotice: '',
  saved: {
    corrected: 'Correction saved. The original record is unchanged.',
    reversed: 'Reversal recorded. Send the payout again and record it here.',
    resent: 'Payout sent again.',
  },
  kindLabels: {
    corrected: 'Payout corrected',
    reversed: 'Payout reversed',
    resent: 'Payout sent again',
  },
};

export function correctionCeilingError(ceiling: string | number | null, scope = 'review'): string {
  return `The amount can't be more than ${formatKshExact(ceiling)} for this ${scope}.`;
}

/** Card / timeline label of a kind; unknown kinds title-cased, never hidden. */
export function correctionKindLabel(
  kind: string,
  copy: CorrectionCopy = REFUND_CORRECTION_COPY,
): string {
  return (
    copy.kindLabels[kind as CorrectionKind] ??
    kind
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/\b[a-z]/g, (c) => c.toUpperCase())
  );
}

/** One adjustment record, as both surfaces show it (kind in the form vocabulary). */
export interface PayoutCorrectionRecord {
  id: string;
  kind: CorrectionKind | string;
  /** Effective receipt before this record (null after a reversal). */
  previousReference: string | null;
  /** Effective amount sent before this record. */
  previousAmount: string | null;
  newReference: string | null;
  newAmount: string | null;
  reason: string;
  createdByUserId: string | null;
  createdBy?: AdminRef | null;
  createdAt: string;
}

/** What the admin typed. */
export interface CorrectionForm {
  kind: CorrectionKind;
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
export function validateCorrection(
  f: CorrectionForm,
  ctx: CorrectionContext,
  copy: CorrectionCopy = REFUND_CORRECTION_COPY,
): CorrectionErrors {
  const errors: CorrectionErrors = { reference: null, amount: null, reason: null, form: null };
  const reference = f.reference.trim();
  if (isBlank(reference)) {
    if (f.kind !== 'corrected') errors.reference = CORRECTION_CODE_ERROR;
  } else if (!MPESA_CODE_PATTERN.test(reference)) {
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
        errors.amount = correctionCeilingError(ctx.ceiling, copy.scope);
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

/** Corrections request body in the form vocabulary (each surface maps `kind`). */
export interface CorrectionBody {
  kind: CorrectionKind;
  newReference?: string;
  newAmount?: number;
  reason: string;
  /** Latest correction id the drawer saw, or null when there was none (required key). */
  expectedLatestCorrectionId: string | null;
}

/**
 * Corrections body: only the fields the kind uses and the admin filled;
 * receipt trimmed and upper-cased, amount a JSON number.
 */
export function correctionBody(
  f: CorrectionForm,
  expectedLatestCorrectionId: string | null,
): CorrectionBody {
  const body: CorrectionBody = {
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
export const CORRECTION_SUBMIT: Record<CorrectionKind, string> = {
  corrected: 'Save correction',
  reversed: 'Record reversal',
  resent: 'Record new payout',
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

const txt = (text: string): TextPart => ({ text, num: false });
const num = (text: string): TextPart => ({ text, num: true });

/**
 * A-08 confirm body as parts: every receipt / reversal code and amount is
 * its own Fira Code part (m-11), never left to the numeric pattern.
 */
export function correctionDialogParts(
  f: CorrectionForm,
  copy: CorrectionCopy = REFUND_CORRECTION_COPY,
): TextPart[] {
  const reference = f.reference.trim().toUpperCase();
  switch (f.kind) {
    case 'corrected': {
      const parts = [
        txt(
          "The original payout record stays as it is. This correction is added to the history and can't be edited or deleted.",
        ),
      ];
      if (reference) parts.push(txt(' New receipt '), num(reference), txt('.'));
      const amount = parseKsh(f.amount);
      if (amount !== null) parts.push(txt(' Amount sent '), num(formatKshExact(amount)), txt('.'));
      return parts;
    }
    case 'reversed':
      return [
        txt('Reversal code '),
        num(reference),
        txt(
          `. The ${copy.subject} will show as not sent until you record a new payout. This can't be edited or deleted.`,
        ),
      ];
    default:
      return [
        txt('M-Pesa receipt '),
        num(reference),
        txt(`.${copy.resentNotice} This can't be edited or deleted.`),
      ];
  }
}

/** The dialog body as plain text. */
export function correctionDialogBody(
  f: CorrectionForm,
  copy: CorrectionCopy = REFUND_CORRECTION_COPY,
): string {
  return correctionDialogParts(f, copy)
    .map((p) => p.text)
    .join('');
}
