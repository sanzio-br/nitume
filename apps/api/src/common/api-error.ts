import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Error with a stable, machine-readable `code` the apps can switch on
 * instead of matching message text. Body shape:
 * `{ statusCode, code, message, ...extra }`.
 */
export class ApiError extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: string,
    message: string,
    extra: Record<string, unknown> = {},
  ) {
    super({ statusCode: status, code, message, ...extra }, status);
  }
}

/** 409 with a stable `code` (N-8: no bare ConflictException in the API). */
export const conflict = (
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
): ApiError => new ApiError(HttpStatus.CONFLICT, code, message, extra);

/**
 * 401 `account_suspended`: the account is suspended or banned. One body for
 * OTP verify, refresh (#21), the HTTP JWT guard and the Socket.IO handshake
 * (#23), so the apps sign out on a single code.
 */
export const ACCOUNT_SUSPENDED = 'account_suspended';
export const ACCOUNT_SUSPENDED_MESSAGE = 'Account is suspended or banned';

export const accountSuspended = (): ApiError =>
  new ApiError(HttpStatus.UNAUTHORIZED, ACCOUNT_SUSPENDED, ACCOUNT_SUSPENDED_MESSAGE);
