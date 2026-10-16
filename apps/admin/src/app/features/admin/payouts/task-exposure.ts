import { computed, signal } from '@angular/core';
import type { ApiErrorInfo } from '../../../core/api-error';
import type { TaskExposure } from '../../../core/api-types';

/**
 * Row 136 combined task cap (drawer-refund "Combined exposure cap",
 * drawer-runner-payout §3 and §5.2a): customer refunds and the runner's item
 * reimbursement share one cap on a task. Above it only with an override note.
 */

export const OVERRIDE_NOTE_MIN = 10;
export const OVERRIDE_NOTE_MAX = 500;
export const OVERRIDE_NOTE_ERROR = 'Explain the override in 10 to 500 characters.';
export const OVERRIDE_CONFIRM_NOTE =
  'This goes over the task cap. Your note is kept in the audit history.';

/**
 * Extras of a 409 `task_exposure_cap_exceeded`. `scope` `task`: the total
 * paid to Nitume against every refund and the runner's item reimbursement;
 * `item`: the item amount paid against price-decrease refunds and the item
 * reimbursement.
 */
export interface ExposureCap extends TaskExposure {
  requested: string;
  scope: 'task' | 'item';
}

/** Figure labels and notice wording per scope (drawer-refund / drawer-runner-payout 2a). */
export const EXPOSURE_SCOPE_COPY: Record<
  'task' | 'item',
  { total: string; refunds: string; reimbursements: string; remaining: string; lead: string }
> = {
  task: {
    total: 'Total paid to Nitume',
    refunds: 'Customer refunds committed',
    reimbursements: 'Runner reimbursements committed',
    remaining: 'Left within the task cap',
    lead: '',
  },
  item: {
    total: 'Item amount paid',
    refunds: 'Other price-decrease refunds',
    reimbursements: 'Runner item reimbursement committed',
    remaining: 'Left of the item amount',
    lead: "Price-decrease refunds and the runner's item reimbursement both come out of the item amount paid. ",
  },
};

/** The figures of a 409 `task_exposure_cap_exceeded`, else null. */
export function exposureCapFrom(err: ApiErrorInfo): ExposureCap | null {
  if (err.code !== 'task_exposure_cap_exceeded') return null;
  const x = err.extra;
  const str = (k: string) => (x[k] === undefined || x[k] === null ? '0' : String(x[k]));
  return {
    totalPaidToNitume: str('totalPaidToNitume'),
    committedRefunds: str('committedRefunds'),
    committedReimbursements: str('committedReimbursements'),
    remaining: str('remaining'),
    requested: str('requested'),
    scope: x['scope'] === 'item' ? 'item' : 'task',
  };
}

const SOURCE_LABELS: Record<string, string> = {
  refund_decision: 'Refund decision',
  refund_correction: 'Refund correction',
  runner_reimbursement: 'Runner reimbursement',
};

export function overrideSourceLabel(source: string): string {
  return (
    SOURCE_LABELS[source] ??
    source
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/\b[a-z]/g, (c) => c.toUpperCase())
  );
}

const cents = (v: string | number) => Math.round(Number(v) * 100);

/**
 * The override note a form needs after the API refused an amount above the
 * task cap. `amount` is the form's current amount: lowering it to the
 * remaining cap or below hides the field and drops the note from the request.
 */
export class ExposureOverrideState {
  /** The figures from the last 409, or null before any. */
  readonly cap = signal<ExposureCap | null>(null);
  readonly note = signal('');
  readonly touched = signal(false);
  readonly serverError = signal<string | null>(null);

  constructor(private readonly amount: () => number | null) {}

  /** Over the cap: the note field shows and is required. */
  readonly active = computed(() => {
    const cap = this.cap();
    const amount = this.amount();
    return !!cap && amount !== null && cents(amount) > cents(cap.remaining);
  });
  /** How far the current amount is above the cap. */
  readonly over = computed(() => {
    const cap = this.cap();
    const amount = this.amount();
    return cap && amount !== null ? Math.max(0, cents(amount) - cents(cap.remaining)) / 100 : 0;
  });
  readonly noteError = computed(() => {
    if (!this.active()) return null;
    const n = this.note().trim().length;
    return n < OVERRIDE_NOTE_MIN || n > OVERRIDE_NOTE_MAX ? OVERRIDE_NOTE_ERROR : null;
  });
  readonly shownError = computed(
    () => this.serverError() ?? (this.touched() ? this.noteError() : null),
  );

  /** `exposureOverrideNote` for the request, only while over the cap. */
  body(): { exposureOverrideNote?: string } {
    return this.active() ? { exposureOverrideNote: this.note().trim() } : {};
  }

  setNote(value: string): void {
    this.note.set(value);
    this.serverError.set(null);
  }

  /** Maps the row-136 errors; false for any other error. */
  applyError(err: ApiErrorInfo): boolean {
    const cap = exposureCapFrom(err);
    if (cap) {
      this.cap.set(cap);
      this.serverError.set(null);
      return true;
    }
    if (err.code === 'exposure_override_note_invalid') {
      this.touched.set(true);
      this.serverError.set(OVERRIDE_NOTE_ERROR);
      return true;
    }
    return false;
  }

  reset(): void {
    this.cap.set(null);
    this.note.set('');
    this.touched.set(false);
    this.serverError.set(null);
  }
}
