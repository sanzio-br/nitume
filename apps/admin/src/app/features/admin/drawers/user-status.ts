import { ApiErrorInfo, FORBIDDEN_COPY } from '../../../core/api-error';
import type { AdminUserSummary, UserStatus } from '../../../core/api-types';
import { statusLabel } from '../../../shared/status-chip.component';

/**
 * Account status actions (issue #24, `docs/specs/admin/drawer-user-status.md`):
 * rules (WQ-23), copy (owner SQ-6, SQ-4) and the error mapping (§7).
 */

export type AccountAction = 'suspend' | 'ban' | 'reactivate';
export type AccountAudience = 'runner' | 'customer';

/** Status the PATCH asks for, per action. */
export const ACTION_TARGET: Record<AccountAction, UserStatus> = {
  suspend: 'suspended',
  ban: 'banned',
  reactivate: 'active',
};

export const REASON_MIN = 10;
export const REASON_MAX = 500;
export const REASON_REQUIRED = 'Enter a reason.';
export const REASON_SHORT = 'Enter at least 10 characters.';

export const OWN_ACCOUNT_COPY = "You can't change your own account.";
export const ADMIN_ACCOUNT_COPY = "Admin accounts can't be changed here.";
export const NOT_FOUND_COPY = "We couldn't find this account.";
export const STATUS_LOAD_ERROR = "Couldn't load this account's status.";
export const HISTORY_LOAD_ERROR = "Couldn't load the status history.";
export const BAD_REQUEST_COPY =
  'Something went wrong with this request. Close the drawer and try again.';
export const SAVE_ERROR = "Couldn't save. Check your connection and try again.";
/** SQ-4 (owner 2026-10-29): suspend and ban leave open tasks as they are. */
export const OPEN_TASKS_NOTE =
  'Open tasks are not changed. Reassign or cancel them from the task queue.';

/**
 * Actions offered for a status (spec §1). None for an admin account, the
 * signed-in admin's own account, or an unknown status (never guessed).
 */
export function accountActions(
  status: UserStatus | null | undefined,
  blocked: 'self' | 'admin' | null = null,
): AccountAction[] {
  if (blocked) return [];
  switch (status) {
    case 'active':
      return ['suspend', 'ban'];
    case 'suspended':
      return ['reactivate', 'ban'];
    case 'banned':
      return ['reactivate'];
    default:
      return [];
  }
}

/** Why the section shows no buttons for this account, before any request. */
export function blockedReason(
  user: Pick<AdminUserSummary, 'id' | 'role'> | null,
  meId: string | null,
): 'self' | 'admin' | null {
  if (!user) return null;
  if (meId && user.id === meId) return 'self';
  if (user.role === 'admin') return 'admin';
  return null;
}

export interface ActionCopy {
  button: string;
  title: string;
  body: string;
  confirm: string;
  busy: string;
  success: string;
}

const SIGNED_OUT = "They're signed out on every device straight away and can't use Nitume";
const GENERIC_MESSAGE = 'They see a general "account suspended" message, not your reason.';

/** Spec §5 copy per action and audience (approved, SQ-6). */
export function actionCopy(action: AccountAction, who: AccountAudience): ActionCopy {
  switch (action) {
    case 'suspend':
      return {
        button: `Suspend ${who}`,
        title: `Suspend this ${who}?`,
        body: `${SIGNED_OUT} until an admin reactivates the account. ${GENERIC_MESSAGE}`,
        confirm: `Suspend ${who}`,
        busy: 'Suspending…',
        success: `Account suspended. The ${who} has been signed out.`,
      };
    case 'ban':
      return {
        button: `Ban ${who}`,
        title: `Ban this ${who}?`,
        body: `Use a ban for serious or repeated breaches. ${SIGNED_OUT}. ${GENERIC_MESSAGE} An admin can reactivate a banned account later.`,
        confirm: `Ban ${who}`,
        busy: 'Banning…',
        success: `Account banned. The ${who} has been signed out.`,
      };
    case 'reactivate':
      return {
        button: `Reactivate ${who}`,
        title: `Reactivate this ${who}?`,
        body: 'They can sign in again with a new code sent to their phone. Devices signed out earlier stay signed out.',
        confirm: `Reactivate ${who}`,
        busy: 'Reactivating…',
        success: `Account reactivated. The ${who} can sign in again.`,
      };
  }
}

/** Reason hint (plain: the numbers are a rule, not data). */
export function reasonHint(who: AccountAudience): string {
  return `Required, 10 to 500 characters. Kept in the account history. The ${who} never sees it.`;
}

/** Client rule mirroring the API: 10-500 characters after trimming. */
export function reasonValid(reason: string): boolean {
  const n = reason.trim().length;
  return n >= REASON_MIN && n <= REASON_MAX;
}

export function reasonError(reason: string): string | null {
  const n = reason.trim().length;
  if (n === 0) return REASON_REQUIRED;
  if (n < REASON_MIN) return REASON_SHORT;
  return null;
}

/** `Active`, `Suspended`, `Banned`. */
export function accountLabel(status: unknown): string {
  return statusLabel(typeof status === 'string' ? status : null, 'account');
}

const VERB: Record<UserStatus, string> = {
  suspended: 'suspended',
  banned: 'banned',
  active: 'reactivated',
};

/** Where a failed status change shows (spec §7). */
export type StatusChangeFailure =
  /** Field error under `Reason`; the dialog stays open with the text. */
  | { kind: 'field'; text: string }
  /** Dialog notice; `locked` keeps the confirm disabled (403 without a code). */
  | { kind: 'dialog'; text: string; locked?: boolean }
  /**
   * Section notice; the dialog closes. `block` hides the actions (or, for
   * `missing`, the actions and the history); `reload` refetches the status
   * and history page 1.
   */
  | {
      kind: 'section';
      tone: 'danger' | 'info';
      text: string;
      block?: 'self' | 'admin' | 'missing';
      reload?: boolean;
    }
  /** 401: the auth interceptor handles it. */
  | { kind: 'none' };

export function statusChangeFailure(err: ApiErrorInfo): StatusChangeFailure {
  const { status, code, extra } = err;
  if (status === 400) {
    if (code === 'status_reason_invalid') {
      const min = typeof extra['minLength'] === 'number' ? extra['minLength'] : REASON_MIN;
      const max = typeof extra['maxLength'] === 'number' ? extra['maxLength'] : REASON_MAX;
      return { kind: 'field', text: `Enter a reason of ${min} to ${max} characters.` };
    }
    return { kind: 'dialog', text: BAD_REQUEST_COPY };
  }
  if (status === 401) return { kind: 'none' };
  if (status === 403) {
    if (code === 'cannot_change_own_status') {
      return { kind: 'section', tone: 'danger', text: OWN_ACCOUNT_COPY, block: 'self' };
    }
    if (code === 'cannot_change_admin_status') {
      return { kind: 'section', tone: 'danger', text: ADMIN_ACCOUNT_COPY, block: 'admin' };
    }
    return { kind: 'dialog', text: FORBIDDEN_COPY, locked: true };
  }
  if (status === 404) {
    return { kind: 'section', tone: 'danger', text: NOT_FOUND_COPY, block: 'missing' };
  }
  if (status === 409 && code === 'status_unchanged') {
    return {
      kind: 'section',
      tone: 'info',
      text: `This account is already ${accountLabel(extra['status'])}. Nothing was changed.`,
      reload: true,
    };
  }
  if (status === 409 && code === 'status_transition_not_allowed') {
    const to = extra['to'] as UserStatus;
    return {
      kind: 'section',
      tone: 'info',
      text: `This account is ${accountLabel(extra['from'])} now, so it can't be ${VERB[to] ?? 'changed'}. The latest status is shown.`,
      reload: true,
    };
  }
  return { kind: 'dialog', text: SAVE_ERROR };
}
