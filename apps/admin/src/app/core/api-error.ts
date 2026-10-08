import { HttpErrorResponse } from '@angular/common/http';

/**
 * Normalised API failure (A-14). Read from the API body
 * `{ statusCode, code, message, ...extra }`; class-validator 400s carry
 * `message: string[]`. Status 0 = network failure. Components map this to
 * spec copy and never render `HttpErrorResponse.message`.
 */
export interface ApiErrorInfo {
  status: number;
  code?: string;
  /** First server message (for logs/mapping only, not user copy). */
  message: string;
  /** Every server message (validation lists). */
  messages: string[];
  extra: Record<string, unknown>;
}

/** Shared 403 copy (`_shared.md` §2). */
export const FORBIDDEN_COPY = "You don't have access to this. Sign in with an ops admin account.";

export function apiError(err: unknown): ApiErrorInfo {
  if (isApiErrorInfo(err)) {
    return err;
  }
  if (err instanceof HttpErrorResponse) {
    const body = err.error;
    if (body && typeof body === 'object' && !isProgressEvent(body)) {
      const {
        statusCode,
        code,
        message,
        error: _error,
        ...extra
      } = body as Record<string, unknown>;
      const messages = Array.isArray(message)
        ? message.map(String)
        : typeof message === 'string'
          ? [message]
          : [];
      return {
        status: typeof statusCode === 'number' ? statusCode : err.status,
        code: typeof code === 'string' ? code : undefined,
        message: messages[0] ?? '',
        messages,
        extra,
      };
    }
    return { status: err.status, message: '', messages: [], extra: {} };
  }
  return { status: 0, message: '', messages: [], extra: {} };
}

function isProgressEvent(body: object): boolean {
  return typeof ProgressEvent !== 'undefined' && body instanceof ProgressEvent;
}

function isApiErrorInfo(err: unknown): err is ApiErrorInfo {
  return (
    !!err &&
    typeof err === 'object' &&
    !(err instanceof HttpErrorResponse) &&
    typeof (err as ApiErrorInfo).status === 'number' &&
    Array.isArray((err as ApiErrorInfo).messages)
  );
}

/** True for a network failure or a 5xx. */
export function isTransient(e: ApiErrorInfo): boolean {
  return e.status === 0 || e.status >= 500;
}
