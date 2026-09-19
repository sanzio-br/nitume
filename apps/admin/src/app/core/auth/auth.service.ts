import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthStore } from './auth.store';
import type {
  ActingRole,
  AuthTokens,
  OtpRequestResult,
  OtpVerifyResult,
  RefreshResult,
  UserMe,
} from '../api-types';

/**
 * Admin OTP login module (design `nitume_admin_dashboard.html → #login-screen`):
 *
 *  1. `POST /auth/otp/request { phone }`            → dev OTP prints to API console
 *  2. `POST /auth/otp/verify  { phone, code }`      → `{ user, tokens }`, held as
 *     `admin` pair, acting-role `admin` (the committed contract header)
 *
 * The HTTP interceptor attaches `Authorization: Bearer …` + the
 * `x-nitume-acting-role` header on every call after login, and rotates once on
 * 401 via `/auth/refresh`.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly base = `${environment.apiBaseUrl}/api/v1`;

  constructor(
    private readonly http: HttpClient,
    private readonly store: AuthStore,
    private readonly router: Router,
  ) {}

  /** POST /auth/otp/request — starts the OTP flow for the entered phone. */
  requestOtp(phone: string) {
    return this.http
      .post<OtpRequestResult>(`${this.base}/auth/otp/request`, { phone })
      .pipe(tap((r) => console.info('[nitume:admin] OTP requested', r)));
  }

  /** POST /auth/otp/verify — exchanges the console-printed code for tokens. */
  verifyOtp(phone: string, code: string) {
    const payload: { phone: string; code: string; role?: ActingRole; actingRole?: ActingRole } = {
      phone,
      code,
      actingRole: 'admin',
    };
    return this.http.post<OtpVerifyResult>(`${this.base}/auth/otp/verify`, payload).pipe(
      tap(({ user, tokens }) => {
        this.store.applyTokens(tokens);
        this.store.setUser(user);
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
