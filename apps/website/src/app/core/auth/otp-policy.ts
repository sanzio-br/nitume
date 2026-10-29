// OTP policy (OA-17) and API error classification (auth-foundation §3).
// Port of Flutter `OtpPolicy` / `OtpErrorKind`. The server enforces every
// rule; the client only displays it.
import { HttpErrorResponse } from '@angular/common/http';

export const OTP_CODE_LENGTH = 6;
/** Code validity; no screen states a duration. */
export const OTP_TTL_SECONDS = 300;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
export const OTP_REQUESTS_PER_HOUR = 5;

export type OtpErrorKind =
  | 'incorrect'
  | 'expired'
  | 'attemptsExhausted'
  | 'notRequested'
  | 'resendTooSoon'
  | 'requestLimitReached'
  | 'ipRateLimited'
  | 'deliveryFailed';

const CODED_KINDS: Record<string, OtpErrorKind> = {
  otp_incorrect: 'incorrect',
  otp_expired: 'expired',
  otp_attempts_exhausted: 'attemptsExhausted',
  otp_not_requested: 'notRequested',
  otp_resend_cooldown: 'resendTooSoon',
  otp_rate_limited: 'requestLimitReached',
  otp_ip_rate_limited: 'ipRateLimited',
  otp_delivery_failed: 'deliveryFailed',
};

interface ApiErrorBody {
  code?: unknown;
  message?: unknown;
  retryAfterSeconds?: unknown;
  secondsRemaining?: unknown;
}

function bodyOf(err: unknown): ApiErrorBody {
  if (!(err instanceof HttpErrorResponse)) return {};
  const body = err.error as unknown;
  return typeof body === 'object' && body !== null ? (body as ApiErrorBody) : {};
}

/** `error.code` of an API error body (`apps/api/src/common/api-error.ts`), or null. */
export function apiErrorCode(err: unknown): string | null {
  const code = bodyOf(err).code;
  return typeof code === 'string' && code ? code : null;
}

function messageOf(err: unknown): string {
  const message = bodyOf(err).message;
  if (typeof message === 'string') return message.toLowerCase();
  if (Array.isArray(message)) return message.join(' ').toLowerCase();
  return '';
}

/**
 * The OTP kind of an API error, or null (not an OTP error). Without a
 * `code` (older API builds) the Flutter `fromApiException` message rules
 * apply.
 */
export function otpErrorKind(err: unknown): OtpErrorKind | null {
  if (!(err instanceof HttpErrorResponse)) return null;
  const code = apiErrorCode(err);
  if (code) return CODED_KINDS[code] ?? null;
  const message = messageOf(err);
  if (err.status === 429) return message.includes('please wait') ? 'resendTooSoon' : 'requestLimitReached';
  if (err.status === 401) {
    if (message.includes('too many incorrect')) return 'attemptsExhausted';
    if (message.includes('expired') || message.includes('no active verification code')) return 'expired';
    if (message.includes('no verification code')) return 'notRequested';
    if (message.includes('incorrect verification code')) return 'incorrect';
  }
  return null;
}

/** `account_suspended` (verify, refresh, any authenticated route; PR #22, #25). */
export function isAccountSuspended(err: unknown): boolean {
  return apiErrorCode(err) === 'account_suspended';
}

/**
 * On verify only: an uncoded 401 that matches no OTP rule is treated as a
 * suspended account (Flutter parity, §3).
 */
export function isVerifySuspended(err: unknown): boolean {
  if (isAccountSuspended(err)) return true;
  return (
    err instanceof HttpErrorResponse &&
    err.status === 401 &&
    apiErrorCode(err) === null &&
    otpErrorKind(err) === null
  );
}

/** `role_mismatch` on verify (RA-9, not built in the API yet). */
export function isRoleMismatch(err: unknown): boolean {
  return apiErrorCode(err) === 'role_mismatch';
}

/** `retryAfterSeconds` (or `secondsRemaining`) in seconds, or null. */
export function retryAfter(err: unknown): number | null {
  const body = bodyOf(err);
  for (const value of [body.retryAfterSeconds, body.secondsRemaining]) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

/** Whole minutes for the rate-limit copy: `max(1, ceil(s / 60))`, at most 999. */
export function minutesFrom(seconds: number): number {
  return Math.min(999, Math.max(1, Math.ceil(seconds / 60)));
}
