import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { ApiError } from '../../common/api-error';

/**
 * CSRF defence for the cookie routes (WQ-8), on top of `SameSite=Strict`:
 * the request must carry an `Origin` header naming one of the configured
 * website origins (WEB_ORIGINS). Browsers always send `Origin` on a
 * cross-origin `fetch`/XHR POST and cannot be made to forge it, so a page on
 * any other origin, or a request without an Origin, is refused with
 * 403 `web_origin_not_allowed` before the cookie is read or set.
 */
@Injectable()
export class WebOriginGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const origin = req.headers.origin;
    const allowed = this.config.get<string[]>('web.origins', []);
    if (typeof origin === 'string' && allowed.includes(origin)) {
      return true;
    }
    throw new ApiError(
      HttpStatus.FORBIDDEN,
      'web_origin_not_allowed',
      'This origin may not use the web sign-in session',
    );
  }
}
