import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  Errand,
  ErrandStatus,
  ErrandStatusHistoryEntry,
  ListErrandsResult,
  ListRunnersResult,
  OtpRequestResult,
  OtpVerifyResult,
  RefreshResult,
  ResolveDisputeResult,
  ResolveDisputeVerdict,
  UserMe,
} from '../api-types';

/**
 * Thin typed wrapper over the committed NestJS `apps/api` surface
 * (global prefix `/api/v1`, port 3000, JWT bearer auth).
 *
 * Auth is attached by the shared `authHttpInterceptor` (access token +
 * `x-nitume-acting-role: admin`); this service never reads localStorage.
 * Endpoints follow the committed controller surface in `apps/api` — do not
 * invent paths or fields the API does not actually return.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly base = `${environment.apiBaseUrl}/api/v1`;

  constructor(private readonly http: HttpClient) {}

  /** POST /auth/otp/request — in dev the OTP prints to the API console. */
  requestOtp(phone: string) {
    return this.http.post<OtpRequestResult>(`${this.base}/auth/otp/request`, { phone });
  }

  /** POST /auth/otp/verify — returns `{ user, tokens }` for an admin acting role. */
  verifyOtp(phone: string, code: string, role: string) {
    return this.http.post<OtpVerifyResult>(`${this.base}/auth/otp/verify`, {
      phone,
      code,
      role,
    });
  }

  /** POST /auth/refresh — rotates the access/refresh pair. */
  refresh(refreshToken: string) {
    return this.http.post<RefreshResult>(`${this.base}/auth/refresh`, { refreshToken });
  }

  /** GET /users/me — the acting admin's public profile (phone, role, status). */
  me() {
    return this.http.get<UserMe>(`${this.base}/users/me`);
  }

  /** GET /errands — admins see all errands; optional status + cursor pagination. */
  listErrands(status?: ErrandStatus | null, cursor?: string | null, limit = 100) {
    let params = new HttpParams();
    if (status) params = params.set('status', status);
    if (cursor) params = params.set('cursor', cursor);
    params = params.set('limit', String(limit));
    return this.http.get<ListErrandsResult>(`${this.base}/errands`, { params });
  }

  /** GET /errands/:id — full errand row. */
  getErrand(id: string) {
    return this.http.get<Errand>(`${this.base}/errands/${id}`);
  }

  /** GET /errands/:id/history — append-only status timeline (chronological). */
  getErrandHistory(id: string) {
    return this.http.get<ErrandStatusHistoryEntry[]>(`${this.base}/errands/${id}/history`);
  }

  /** PATCH /errands/:id/resolve-dispute — admin verdict with mandatory rationale. */
  resolveDispute(id: string, verdict: ResolveDisputeVerdict, rationale: string) {
    return this.http.patch<ResolveDisputeResult>(`${this.base}/errands/${id}/resolve-dispute`, {
      verdict,
      rationale,
    });
  }

  /** GET /runners — admin runner directory (cursor-paginated). */
  listRunners(cursor?: string | null, limit = 100) {
    let params = new HttpParams();
    if (cursor) params = params.set('cursor', cursor);
    params = params.set('limit', String(limit));
    return this.http.get<ListRunnersResult>(`${this.base}/runners`, { params });
  }
}
