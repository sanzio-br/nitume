// OTP policy helpers (auth-foundation §3, §9.7 F9.45, F9.46).
import { HttpErrorResponse } from '@angular/common/http';
import {
  OTP_CODE_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_REQUESTS_PER_HOUR,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_SECONDS,
  isAccountSuspended,
  isRoleMismatch,
  isVerifySuspended,
  minutesFrom,
  otpErrorKind,
  retryAfter,
} from './otp-policy';

const err = (status: number, error: unknown) => new HttpErrorResponse({ status, error });

describe('otp-policy (#6)', () => {
  it('F9.45. otpErrorKind for the eight codes and the uncoded fallbacks; non-OTP codes are not kinds', () => {
    expect(OTP_CODE_LENGTH).toBe(6);
    expect(OTP_TTL_SECONDS).toBe(300);
    expect(OTP_MAX_ATTEMPTS).toBe(5);
    expect(OTP_RESEND_COOLDOWN_SECONDS).toBe(60);
    expect(OTP_REQUESTS_PER_HOUR).toBe(5);
    const coded: [number, string, string][] = [
      [401, 'otp_incorrect', 'incorrect'],
      [401, 'otp_expired', 'expired'],
      [401, 'otp_attempts_exhausted', 'attemptsExhausted'],
      [401, 'otp_not_requested', 'notRequested'],
      [429, 'otp_resend_cooldown', 'resendTooSoon'],
      [429, 'otp_rate_limited', 'requestLimitReached'],
      [429, 'otp_ip_rate_limited', 'ipRateLimited'],
      [400, 'otp_delivery_failed', 'deliveryFailed'],
    ];
    for (const [status, code, kind] of coded) {
      expect.soft(otpErrorKind(err(status, { statusCode: status, code, message: 'x' })), code).toBe(kind);
    }
    for (const code of ['account_suspended', 'refresh_cookie_missing', 'refresh_invalid', 'web_origin_not_allowed', 'role_mismatch']) {
      expect.soft(otpErrorKind(err(401, { code })), code).toBeNull();
    }
    const uncoded: [number, string, string | null][] = [
      [429, 'Please wait before requesting another code', 'resendTooSoon'],
      [429, 'Too many requests', 'requestLimitReached'],
      [401, 'Too many incorrect attempts', 'attemptsExhausted'],
      [401, 'Verification code expired', 'expired'],
      [401, 'No active verification code', 'expired'],
      [401, 'No verification code requested', 'notRequested'],
      [401, 'Incorrect verification code', 'incorrect'],
      [401, 'Unauthorized', null],
      [500, 'Internal', null],
    ];
    for (const [status, message, kind] of uncoded) {
      expect.soft(otpErrorKind(err(status, { statusCode: status, message })), message).toBe(kind);
    }
    expect(otpErrorKind(new Error('x'))).toBeNull();
    expect(isAccountSuspended(err(401, { code: 'account_suspended' }))).toBe(true);
    expect(isVerifySuspended(err(401, { message: 'Unauthorized' }))).toBe(true);
    expect(isVerifySuspended(err(401, { message: 'Incorrect verification code' }))).toBe(false);
    expect(isRoleMismatch(err(403, { code: 'role_mismatch' }))).toBe(true);
    expect(retryAfter(err(429, { code: 'otp_rate_limited', retryAfterSeconds: 61 }))).toBe(61);
    expect(retryAfter(err(429, { code: 'otp_resend_cooldown', secondsRemaining: 42 }))).toBe(42);
    expect(retryAfter(err(429, { code: 'otp_rate_limited' }))).toBeNull();
  });

  it('F9.46. minutesFrom: 1 → 1, 60 → 1, 61 → 2, 3600 → 60, 0 → 1 (clamped to 999)', () => {
    expect(minutesFrom(1)).toBe(1);
    expect(minutesFrom(60)).toBe(1);
    expect(minutesFrom(61)).toBe(2);
    expect(minutesFrom(3600)).toBe(60);
    expect(minutesFrom(0)).toBe(1);
    expect(minutesFrom(10 ** 9)).toBe(999);
  });
});
