import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  ActingRole,
  AuthTokens,
  ErrandStatus,
  ListErrandsResult,
  ListRunnersResult,
  OtpRequestResult,
  OtpVerifyResult,
  RefreshResult,
  UserMe,
} from '../api-types';

/**
 * Thin typed wrapper over the committed NestJS `apps/api` surface
 * (global prefix `/api/v1`, port 3000, JWT bearer auth).
 *
 * Every admin call carries:
 *  - `Authorization: Bearer <accessToken>`
 *  - `x-nitume-acting-role: admin` (the committed acting-role contract that
 *    lets one account expose different role surfaces; guards read it via
 *    `UserRole`/`Roles` on the API side).
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly base = environment.apiBaseUrl;

  constructor(private readonly http: HttpClient) {}

  private token(): { auth: string; acting: ActingRole } {
    const tokens = this.readTokens();
    const acting: ActingRole = 'admin';
    return {
      auth: tokens?.accessToken ? `Bearer ${tokens.accessToken}` : '',
      acting,
    };
  }

  private readTokens(): AuthTokens | null {
    try {
      const raw = window.localStorage.getItem('nitume_admin_tokens');
      return raw ? (JSON.parse(raw) as AuthTokens) : null;
    } catch {
      return null;
    }
  }

  /** POST /auth/otp/request — in dev the OTP prints to the API console. */
  requestOtp(phone: string) {
    return this.http.post<OtpRequestResult>(
      `${this.base}/auth/otp/request`,
      { phone },
    );
  }

  /** POST /auth/otp/verify — returns `{ user, tokens }`. Stores the pair. */
  verifyOtp(phone: string, code: string, role: string) {
    return this.http
      .post<OtpVerifyResult>(`${this.base}/auth/otp/verify`, { phone, code, role })
      .pipe(
        // tap into a side channel rather than a shared store to keep this
        // service dependency-light for the admin shell.
      );
  }

  /** POST /auth/refresh — rotates the access/refresh pair. */
  refresh(refreshToken: string) {
    return this.http.post<RefreshResult>(`${this.base}/auth/refresh`, {
      refreshToken,
    });
  }

  /** GET /users/me */
  me() {
    const { auth, acting } = this.token();
    return this.http.get<UserMe>(`${this.base}/users/me`, {
      headers: this.headers(auth, acting),
    });
  }

  /** GET /errands — admin sees all; optional status + cursor pagination. */
  listErrands(status?: ErrandStatus | null, cursor?: string | null) {
    const { auth, acting } = this.token();
    let params = new HttpParams();
    if (status) params = params.set('status', status);
    if (cursor) params = params.set('cursor', cursor);
    return this.http.get<ListErrandsResult>(`${this.base}/errands`, {
      params,
      headers: this.headers(auth, acting),
    });
  }

  /** GET /runners — admin runner directory (cursor-paginated). */
  listRunners(cursor?: string | null) {
    const { auth, acting } = this.token();
    let params = new HttpParams();
    if (cursor) params = params.set('cursor', cursor);
    return this.http.get<ListRunnersResult>(`${this.base}/runners`, {
      params,
      headers: this.headers(auth, acting),
    });
  }

  private headers(auth: string, acting: ActingRole): Record<string, string> {
    return {
      ...(auth ? { Authorization: auth } : {}),
      'x-nitume-acting-role': acting,
    };
  }
}
