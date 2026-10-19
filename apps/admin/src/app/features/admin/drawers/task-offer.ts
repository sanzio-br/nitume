import type { ApiErrorInfo } from '../../../core/api-error';
import { FORBIDDEN_COPY } from '../../../core/api-error';
import type { Errand } from '../../../core/api-types';

/**
 * `drawer-task-offer` labels and rules shared by the task drawer's `Runner`
 * section and its expire dialog.
 */

/** `Reason` row of a declined offer (row 210). Ops read about the runner. */
const DECLINE_REASON_LABELS: Record<string, string> = {
  over_purchase_limit: 'Above their purchase limit',
  too_far: 'Too far away',
  not_available: 'Not available',
  other: 'Other reason',
};

export function declineReasonLabel(reason: string | null | undefined): string {
  if (!reason) return 'No reason given';
  return (
    DECLINE_REASON_LABELS[reason] ??
    reason.charAt(0).toUpperCase() + reason.slice(1).replace(/_/g, ' ')
  );
}

/**
 * Which `Runner` section state is built (findings 26, 30):
 * - `declined`: RUNNER_ASSIGNED whose latest offer was declined, deadline
 *   not passed (the Deadline passed sub-state takes precedence, row 185).
 * - `expired_by_ops`: EXPIRED by an admin from RUNNER_ASSIGNED (row 187).
 * Other sub-states are not built yet (findings 16, 21, 24, 29).
 */
export type OfferSectionState = 'declined' | 'expired_by_ops' | null;

export function offerSectionState(e: Errand): OfferSectionState {
  if (
    e.status === 'RUNNER_ASSIGNED' &&
    !e.deadlinePassed &&
    e.lastAssignment?.status === 'declined'
  ) {
    return 'declined';
  }
  if (
    e.status === 'EXPIRED' &&
    e.expiry?.trigger === 'admin' &&
    e.expiry.fromStatus !== 'PAYMENT_CONFIRMED'
  ) {
    return 'expired_by_ops';
  }
  return null;
}

/** `Expire task — no runner available` shows only when the server allows it (row 202). */
export function canExpireNoRunner(e: Errand): boolean {
  return e.status === 'RUNNER_ASSIGNED' && !!e.canExpire?.noRunner;
}

/** `Runners tried`: offers that were declined or lapsed (one per runner, row 178). */
export function runnersTried(e: Errand): number | null {
  if (!e.assignments) return null;
  return e.assignments.filter((a) => a.status === 'declined' || a.status === 'expired').length;
}

/** Task name in dialog copy: title, else the first line of the description. */
export function errandTitle(e: Pick<Errand, 'title' | 'description'>): string {
  return e.title?.trim() || e.description.split('\n')[0]?.trim() || 'this task';
}

export const EXPIRE_REASON_MIN = 10;
export const EXPIRE_REASON_MAX = 500;
export const EXPIRE_REASON_SHORT = 'Enter at least 10 characters.';
export const EXPIRE_REASON_INVALID = 'Give a reason (10–500 characters).';
export const TASK_CHANGED = 'This task changed. Check the latest offer.';

/** 409 `expiry_not_allowed` copy by `reason`; never the API `message`. */
const EXPIRY_REFUSAL_COPY: Record<string, string> = {
  eligible_runners_remain: 'Eligible runners are still available. Offer the task to one of them.',
  open_offer: 'This task has an open offer. Wait for the runner to answer.',
  deadline_passed: 'The deadline has passed, so this task expires automatically.',
};

/** What the expire dialog does with a failed `POST /errands/:id/expire`. */
export type ExpireFailure =
  | { kind: 'reload'; text: string }
  | { kind: 'field'; text: string }
  | { kind: 'dialog'; text: string };

export function expireFailure(err: ApiErrorInfo): ExpireFailure {
  if (err.status === 409) {
    if (err.code === 'expiry_not_allowed') {
      const reason = typeof err.extra['reason'] === 'string' ? err.extra['reason'] : '';
      return { kind: 'reload', text: EXPIRY_REFUSAL_COPY[reason] ?? TASK_CHANGED };
    }
    return { kind: 'reload', text: TASK_CHANGED };
  }
  if (err.status === 400 && err.code === 'expiry_reason_invalid') {
    return { kind: 'field', text: EXPIRE_REASON_INVALID };
  }
  if (err.status === 403) {
    return { kind: 'dialog', text: FORBIDDEN_COPY };
  }
  return { kind: 'dialog', text: "Couldn't expire the task. Try again." };
}
