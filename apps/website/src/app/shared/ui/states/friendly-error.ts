// Default copy for a failed request (customer/runner `_shared.md` §7,
// Flutter `friendlyError`).
import { HttpErrorResponse } from '@angular/common/http';

export const NETWORK_ERROR_MESSAGE = 'Check your connection and try again.';
export const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.';

/** Network failure (HTTP status 0, fetch `TypeError`) or anything else. */
export function friendlyError(error: unknown): string {
  if (error instanceof HttpErrorResponse && error.status === 0) return NETWORK_ERROR_MESSAGE;
  if (error instanceof TypeError) return NETWORK_ERROR_MESSAGE;
  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error as { status: unknown }).status === 0
  ) {
    return NETWORK_ERROR_MESSAGE;
  }
  return GENERIC_ERROR_MESSAGE;
}
