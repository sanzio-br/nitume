import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { Observable } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { AuthStore } from '../auth/auth.store';

const PUBLIC_SUFFIXES = ['/auth/otp/request', '/auth/otp/verify', '/auth/refresh', '/health'];
const ACTING_ROLE_HEADER = 'x-nitume-acting-role';

/**
 * Attaches `Authorization: Bearer <access>` and the acting-role contract header
 * to every non-public request. On a single 401 it rotates once via
 * `POST /auth/refresh`; if rotation also fails it clears the session and
 * redirects to `/auth/login`.
 */
export const authHttpInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> => {
  const store = inject(AuthStore);
  const authSvc = inject(AuthService);
  const router = inject(Router);

  const isPublic = PUBLIC_SUFFIXES.some((suffix) => req.url.includes(suffix));
  const tokens = store.state().tokens;

  const authed = (use: { accessToken?: string } | null): HttpRequest<unknown> =>
    req.clone({
      setHeaders: {
        ...(use?.accessToken ? { Authorization: `Bearer ${use.accessToken}` } : {}),
        'x-nitume-acting-role': store.actingRole() || 'admin',
      },
    });

  return next(isPublic ? req : authed(tokens)).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status !== 401 || isPublic || !tokens?.refreshToken) {
        return throwError(() => err);
      }
      return authSvc.refresh(tokens.refreshToken).pipe(
        switchMap(() => next(authed(store.state().tokens))),
        catchError(() => {
          store.clear();
          void router.navigate(['/auth/login']);
          return throwError(() => err);
        }),
      );
    }),
  );
};
