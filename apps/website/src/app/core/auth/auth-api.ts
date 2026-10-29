// AuthApi (auth-foundation §4.3): the web auth routes of PR #20 plus the
// user and runner reads #6 needs. The refresh token is the httpOnly
// `nitume_rt` cookie: credentials go only to `/auth/web/*`; refresh and
// logout send no body and no Bearer. Never the mobile `/auth/otp/verify`,
// `/auth/refresh` or `/auth/logout`.
import { HttpClient, HttpContext, HttpContextToken } from '@angular/common/http';
import { Injectable, inject, isDevMode } from '@angular/core';
import { MonoTypeOperatorFunction, catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  OtpRequestResult,
  RunnerMe,
  RunnerVerificationRecord,
  UserMe,
  WebRefreshResult,
  WebSession,
} from '../api-types';
import { apiErrorCode } from './otp-policy';
import type { AppRole } from './auth.tokens';

/**
 * Set on a request whose 401 the caller handles itself (the session's own
 * `GET /users/me`): the interceptor adds the Bearer but does not refresh or
 * sign out.
 */
export const SKIP_SESSION_RETRY = new HttpContextToken<boolean>(() => false);

export const API_V1 = `${environment.apiBaseUrl}/api/v1`;

@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly http = inject(HttpClient);
  private originReported = false;

  /** `POST /auth/otp/request` (shared with the apps): no credentials, no Bearer. */
  requestOtp(phone: string) {
    return this.http.post<OtpRequestResult>(`${API_V1}/auth/otp/request`, { phone });
  }

  /** `POST /auth/web/otp/verify { phone, code, role }`; the API sets `nitume_rt`. */
  verifyOtp(phone: string, code: string, role: AppRole) {
    return this.http
      .post<WebSession>(`${API_V1}/auth/web/otp/verify`, { phone, code, role }, { withCredentials: true })
      .pipe(this.reportOrigin());
  }

  /** `POST /auth/web/refresh`, no body: the cookie is read and rotated. */
  refresh() {
    return this.http
      .post<WebRefreshResult>(`${API_V1}/auth/web/refresh`, null, { withCredentials: true })
      .pipe(this.reportOrigin());
  }

  /** `POST /auth/web/logout`, no body, no Bearer: revokes and clears the cookie. */
  logout() {
    return this.http
      .post<{ message: string }>(`${API_V1}/auth/web/logout`, null, { withCredentials: true })
      .pipe(this.reportOrigin());
  }

  /** `GET /users/me` with Bearer. `ownRetry`: the caller handles a 401 itself. */
  me(opts: { ownRetry?: boolean } = {}) {
    return this.http.get<UserMe>(`${API_V1}/users/me`, {
      context: new HttpContext().set(SKIP_SESSION_RETRY, opts.ownRetry ?? false),
    });
  }

  /** `PATCH /users/me { displayName }`. */
  updateDisplayName(displayName: string) {
    return this.http.patch<UserMe>(`${API_V1}/users/me`, { displayName });
  }

  /** `GET /runners/me` (verification summary). */
  runnerMe() {
    return this.http.get<RunnerMe>(`${API_V1}/runners/me`);
  }

  /** `GET /runners/me/verifications` (older API fallback, §6.3). */
  runnerVerifications() {
    return this.http.get<RunnerVerificationRecord[]>(`${API_V1}/runners/me/verifications`);
  }

  /**
   * 403 `web_origin_not_allowed` is a deployment error (the website origin
   * is missing from the API's WEB_ORIGINS). Never shown on screen; one
   * console error in dev mode.
   */
  private reportOrigin<T>(): MonoTypeOperatorFunction<T> {
    return catchError((err: unknown) => {
      if (!this.originReported && isDevMode() && apiErrorCode(err) === 'web_origin_not_allowed') {
        this.originReported = true;
        console.error(
          'Nitume: the API refused this website origin (403 web_origin_not_allowed). ' +
            'Add it to the API WEB_ORIGINS setting.',
        );
      }
      return throwError(() => err);
    });
  }
}
