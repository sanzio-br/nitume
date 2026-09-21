import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  OtpRequestResult,
  OtpVerifyResult,
  RegisterResult,
} from '../api-types';

/**
 * Thin typed wrapper over the committed NestJS `apps/api` surface
 * (global prefix `/api/v1`, port 3000). These are the public endpoints a
 * website visitor may call without authentication.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly base = `${environment.apiBaseUrl}/api/v1`;

  constructor(private readonly http: HttpClient) {}

  /** POST /auth/otp/request — sends an SMS/WhatsApp code to a Kenyan phone. */
  requestOtp(phone: string) {
    return this.http.post<OtpRequestResult>(`${this.base}/auth/otp/request`, {
      phone,
    });
  }

  /** POST /auth/otp/verify — verifies the code, auto-onboarding first-time users. */
  verifyOtp(phone: string, code: string, role?: string) {
    return this.http.post<OtpVerifyResult>(`${this.base}/auth/otp/verify`, {
      phone,
      code,
      ...(role ? { role } : {}),
    });
  }

  /** POST /auth/register — explicit signup (customer/runner). */
  register(phone: string, role: 'customer' | 'runner', email?: string, password?: string) {
    return this.http.post<RegisterResult>(`${this.base}/auth/register`, {
      phone,
      role,
      ...(email ? { email } : {}),
      ...(password ? { password } : {}),
    });
  }
}