import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AuthStore } from './auth.store';
import { AuthTokens, OtpVerifyResponse, RefreshResponse, UserMe } from '../api-types';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly base = `${environment.apiBaseUrl}/api/v1`;

  constructor(
    private readonly http: HttpClient,
    private readonly store: AuthStore,
  ) {}

  /** POST /auth/otp/request — starts the OTP flow for admin ops. */
  requestOtp(phone: string) {
    return this.http.post<{ message: string }>(`${this.base}/auth/otp/request`, { phone });
  }

  /** POST /auth/otp/verify — exchanges the console-printed code for tokens + Me.
   * `role: 'admin'` and `actingRole: 'admin'` keep the admin surface. */
  verifyOtp(phone: string, code: string) {
    return this.http
      .post<OtpVerifyResponse>(`${this.base}/auth/otp/verify`, {
        phone,
        code,
        role: 'admin',
        actingRole: 'admin',
      })
      .pipe(
        tap(({ user, tokens }) => {
          this.store.applyTokens(tokens);
          this.store.setUser(user);
        }),
      );
  }

  /** POST /auth/refresh — rotate the pair when the interceptor sees 401. */
  refresh(refreshToken: string) {
    return this.http.post<RefreshResponse>(`${this.base}/auth/refresh`, { refreshToken });
  }

  /** POST /auth/logout — revokes the refresh token server-side. */
  logout() {
    const rt = this.store.tokenPair()?.refreshToken;
    if (!rt) return of(undefined);
    return this.http
      .post(`${this.base}/auth/logout`, { refreshToken: rt })
      .pipe(catchError(() => of(undefined)));
  }
}
