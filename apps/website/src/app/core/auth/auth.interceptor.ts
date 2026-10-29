// authInterceptor (auth-foundation §5 items 1–6). Loaded lazily through
// lazyAuthInterceptor (core/lazy-session, WQ-33); registers itself so later
// requests run it synchronously.
import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, catchError, from, switchMap, throwError } from 'rxjs';
import { API_V1, SKIP_SESSION_RETRY } from './auth-api';
import { isAccountSuspended } from './otp-policy';
import { SessionStore } from './session.store';
import { registerAuthInterceptor } from '../lazy-session/lazy-session';

const SCOPE = `${API_V1}/`;

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // 1. Scope: the API only; Maps, fonts and assets pass untouched.
  if (!req.url.startsWith(SCOPE)) return next(req);
  const path = `/${req.url.slice(SCOPE.length).split(/[?#]/)[0]}`;
  const isWeb = path.startsWith('/auth/web/');
  const isOtp = path.startsWith('/auth/otp/');
  const bearer = !isWeb && path !== '/auth/otp/request';
  const session = inject(SessionStore);

  // 2–3. Credentials only on /auth/web/*; Bearer elsewhere when present.
  const prepare = (request: HttpRequest<unknown>): HttpRequest<unknown> => {
    const token = bearer ? session.accessToken() : null;
    return request.clone({
      withCredentials: isWeb,
      ...(token ? { setHeaders: { Authorization: `Bearer ${token}` } } : {}),
    });
  };

  const handle401 = isWeb || isOtp || req.context.get(SKIP_SESSION_RETRY) ? false : true;

  return next(prepare(req)).pipe(
    catchError((err: unknown) => {
      if (!handle401 || !(err instanceof HttpErrorResponse) || err.status !== 401) {
        return throwError(() => err); // 6. 403 and the rest: unchanged.
      }
      // 4. A protected route refused a suspended account (PR #25).
      if (isAccountSuspended(err)) {
        void session.signOut('suspended', session.currentRole());
        return throwError(() => err);
      }
      return from(session.refresh()).pipe(
        switchMap((outcome): Observable<HttpEvent<unknown>> => {
          switch (outcome) {
            case 'ok':
              return retryOnce(req, next, prepare, session);
            case 'rejected':
              void session.signOut('expired', session.currentRole());
              return throwError(() => err);
            case 'suspended':
              void session.signOut('suspended', session.currentRole());
              return throwError(() => err);
            case 'network':
              return throwError(() => err); // no sign-out
          }
        }),
      );
    }),
  );
};

function retryOnce(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  prepare: (r: HttpRequest<unknown>) => HttpRequest<unknown>,
  session: SessionStore,
): Observable<HttpEvent<unknown>> {
  return next(prepare(req)).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401) {
        const reason = isAccountSuspended(err) ? 'suspended' : 'expired';
        void session.signOut(reason, session.currentRole());
      }
      return throwError(() => err);
    }),
  );
}

registerAuthInterceptor(authInterceptor);
