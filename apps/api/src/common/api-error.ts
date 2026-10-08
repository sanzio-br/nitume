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
