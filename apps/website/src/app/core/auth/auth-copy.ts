// User-facing copy shared by the #6 sign-in screens and the sign-out toasts
// (auth-foundation §4.5, view specs). Exact strings; owner decisions noted.

/** WQ-14 (owner, 2026-10-28): admin, business or unknown role. */
export const NOT_ALLOWED_COPY =
  "This number can't be used to sign in here. Use another number, or contact support.";
export const SUSPENDED_COPY = "This account can't sign in. Contact support.";
export const SESSION_EXPIRED_COPY = 'Please sign in again.';
/** Row 127: a customer number on the runner sign-in. */
export const WRONG_ACCOUNT_COPY =
  'This number is registered as a customer account. Use another number, or contact support.';
export const CONTACT_SUPPORT_LABEL = 'Contact support';

/** `Too many code requests. Try again in N min.` (N in Fira Code) / `… later.` */
export const CODE_REQUESTS_PREFIX = 'Too many code requests. Try again';
/** WQ-17 (owner, 2026-10-28): per-IP verify limit; `later` fallback approved. */
export const VERIFY_ATTEMPTS_PREFIX = 'Too many attempts. Try again';
export const RATE_LATER_SUFFIX = ' later.';
export const RATE_IN_PREFIX = ' in ';
export const RATE_MIN_SUFFIX = ' min.';

export const DELIVERY_FAILED_COPY = "We couldn't send the code. Try again.";
export const INVALID_PHONE_COPY = 'Enter a valid Kenyan number, e.g. +254 712 345 678';
export const CODE_TOO_SHORT_COPY = 'Enter the 6-digit code.';
export const CODE_INCORRECT_COPY = 'That code is incorrect. Try again.';
export const CODE_EXHAUSTED_COPY = 'Too many incorrect attempts. Request a new code.';
export const CODE_EXPIRED_COPY = 'This code has expired. Request a new code.';
export const NEW_CODE_SENT_COPY = 'New code sent.';
