import { HttpStatus } from '@nestjs/common';
import { ApiError } from '../common/api-error';
import { UserStatus } from '../common/enums';

/**
 * Issue #24 (owner WQ-22 and WQ-23, 2026-10-28): rules of an admin account
 * status change.
 */

/** Reason bounds, after trimming (owner WQ-23). The reason is internal. */
export const STATUS_REASON_MIN_LENGTH = 10;
export const STATUS_REASON_MAX_LENGTH = 500;

/**
 * Allowed transitions (owner WQ-23): active <-> suspended, active -> banned,
 * suspended -> banned, banned -> active (any admin, with a reason).
 * banned -> suspended is refused.
 */
export const ALLOWED_STATUS_TRANSITIONS: Readonly<Record<UserStatus, readonly UserStatus[]>> = {
  [UserStatus.ACTIVE]: [UserStatus.SUSPENDED, UserStatus.BANNED],
  [UserStatus.SUSPENDED]: [UserStatus.ACTIVE, UserStatus.BANNED],
  [UserStatus.BANNED]: [UserStatus.ACTIVE],
};

export const STATUS_REASON_INVALID = 'status_reason_invalid';
export const CANNOT_CHANGE_OWN_STATUS = 'cannot_change_own_status';
export const CANNOT_CHANGE_ADMIN_STATUS = 'cannot_change_admin_status';
export const USER_NOT_FOUND = 'user_not_found';
export const STATUS_UNCHANGED = 'status_unchanged';
export const STATUS_TRANSITION_NOT_ALLOWED = 'status_transition_not_allowed';

export const isAllowedStatusTransition = (from: UserStatus, to: UserStatus): boolean =>
  ALLOWED_STATUS_TRANSITIONS[from].includes(to);

/** The trimmed reason, or 400 `status_reason_invalid` (missing, not text, or outside 10-500). */
export const normaliseStatusReason = (raw: unknown): string => {
  const reason = typeof raw === 'string' ? raw.trim() : '';
  if (reason.length < STATUS_REASON_MIN_LENGTH || reason.length > STATUS_REASON_MAX_LENGTH) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      STATUS_REASON_INVALID,
      `A reason of ${STATUS_REASON_MIN_LENGTH} to ${STATUS_REASON_MAX_LENGTH} characters is required`,
      { minLength: STATUS_REASON_MIN_LENGTH, maxLength: STATUS_REASON_MAX_LENGTH },
    );
  }
  return reason;
};

export const userNotFound = (): ApiError =>
  new ApiError(HttpStatus.NOT_FOUND, USER_NOT_FOUND, 'User not found');

export const statusUnchanged = (status: UserStatus): ApiError =>
  new ApiError(HttpStatus.CONFLICT, STATUS_UNCHANGED, `The account is already ${status}`, { status });

export const statusTransitionNotAllowed = (from: UserStatus, to: UserStatus): ApiError =>
  new ApiError(HttpStatus.CONFLICT, STATUS_TRANSITION_NOT_ALLOWED, `A ${from} account cannot be set to ${to}`, {
    from,
    to,
    allowed: [...ALLOWED_STATUS_TRANSITIONS[from]],
  });

export const cannotChangeOwnStatus = (): ApiError =>
  new ApiError(HttpStatus.FORBIDDEN, CANNOT_CHANGE_OWN_STATUS, 'You cannot change the status of your own account');

export const cannotChangeAdminStatus = (): ApiError =>
  new ApiError(HttpStatus.FORBIDDEN, CANNOT_CHANGE_ADMIN_STATUS, 'The status of an admin account cannot be changed here');
