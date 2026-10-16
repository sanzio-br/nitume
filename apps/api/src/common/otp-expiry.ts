/**
 * Human wording of the OTP lifetime, derived from `otp.ttlSeconds` so the
 * copy in the email and SMS can never drift from the real expiry (owner
 * decision 2026-10-16: "Your verification code expires in 5 minutes." with
 * the 300 s TTL). Rounds down so the copy never promises more time than the
 * code really has.
 */
export const otpExpiryPhrase = (ttlSeconds: number): string => {
  const seconds = Math.max(1, Math.floor(ttlSeconds));
  if (seconds < 60) {
    return seconds === 1 ? '1 second' : `${seconds} seconds`;
  }
  const minutes = Math.floor(seconds / 60);
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
};

/** Default OTP lifetime when config is missing (matches `otp.ttlSeconds`). */
export const DEFAULT_OTP_TTL_SECONDS = 300;
