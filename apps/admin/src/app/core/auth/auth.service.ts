import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthStore } from './auth.store';
import type {
  OtpRequestResult,
  OtpVerifyResult,
  RefreshResult,
} from '../api-types';

/**
 * Admin OTP login module (design `nitume_admin_dashboard.html → #login-screen`):
 *
 *  1. `POST /auth/otp/email/request { email }`      → emails a code to the admin
 *  2. `POST /auth/otp/email/verify  { email, code }` → `{ user, tokens }`
 *
 * Only provisioned admin accounts receive codes (the API rejects other emails),
 * so the body carries no acting-role field — `forbidNonWhitelisted` would 400
 * on anything outside the DTO. The HTTP interceptor attaches
 * `Authorization: Bearer …` + the `x-nitume-acting-role` header on every call
 * after login, and rotates once on 401 via `/auth/refresh`.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly base = `${environment.apiBaseUrl}/api/v1`;

  constructor(
    private readonly http: HttpClient,
    private readonly store: AuthStore,
    private readonly router: Router,
  ) {}

  /** POST /auth/otp/email/request — emails a code to the entered admin address. */
  requestEmailOtp(email: string) {
    return this.http
      .post<OtpRequestResult>(`${this.base}/auth/otp/email/request`, { email })
      .pipe(tap((r) => console.info('[nitume:admin] OTP requested', r)));
  }

  verifyEmailOtp(email: string, code: string) {
    return this.http
      .post<OtpVerifyResult>(`${this.base}/auth/otp/email/verify`, { email, code })
      .pipe(
        tap((res) => {
          console.log('[AuthService] verifyEmailOtp response:', res);
          this.store.applyTokens(res.tokens);
          this.store.setUser(res.user);
          console.log('[AuthService] store state after apply:', this.store.state());
        }),
      );
  }

  /** POST /auth/refresh — rotate the pair (used by the interceptor on 401). */
  refresh(refreshToken: string) {
    return this.http
      .post<RefreshResult>(`${this.base}/auth/refresh`, { refreshToken })
      .pipe(tap(({ tokens }) => this.store.applyTokens(tokens)));
  }

  /** POST /auth/logout — best-effort revoke; clears the session regardless. */
  logout() {
    const rt = this.store.state().tokens?.refreshToken;
    const sideEffect = rt
      ? this.http
          .post(`${this.base}/auth/logout`, { refreshToken: rt })
          .pipe(catchError(() => of(null)))
      : of(null);
    sideEffect.subscribe({ complete: () => this.#endSession() });
  }

  #endSession(): void {
    this.store.clear();
    void this.router.navigate(['/login']);
  }
}
