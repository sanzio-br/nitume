// CustomerErrandsApi (customer-v-new-category §W5): the errand calls of the
// customer Home and the task wizard. HttpClient only: the #6 lazy
// interceptor adds the Bearer, refreshes and handles `account_suspended`.
// No `withCredentials` (only `/auth/web/*` sends credentials, F§4.3).
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type { ErrandStatus } from '../../../shared/status/status-presentation';

/** The `ErrandView` fields the #7 views read (`apps/api` `ErrandView`). */
export interface ErrandView {
  readonly id: string;
  readonly category: string;
  readonly title: string | null;
  readonly reference: string | null;
  readonly status: string;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
  readonly assignment: { readonly runner: { readonly shortName: string | null } | null } | null;
}

export interface ErrandList {
  readonly items: readonly ErrandView[];
  readonly nextCursor: string | null;
}

export interface ErrandDefaults {
  readonly defaultDeadlineHours: number;
  readonly defaultDeadlineStartsAt: string;
}

/** Customer categories a task can be created in (never `business`). */
export type CreatableCategory = 'buy_for_me' | 'pickup_delivery' | 'inspection' | 'representation' | 'queue_admin';

export type PointType = 'task_site' | 'pickup' | 'dropoff';

/** `POST /errands` body (`CreateErrandDto`, ND§Data). The wire key is `lon`. */
export interface CreateErrandBody {
  category: CreatableCategory;
  title?: string;
  description: string;
  budget: number;
  deadlineAt?: string;
  locations: { pointType: PointType; lat: number; lon: number; addressText: string; placeId?: string }[];
  items?: { name: string; quantity: number }[];
}

export interface ErrandWrite {
  readonly errand: ErrandView;
}

/** The error codes the wizard reads (NC§W5). */
export type ApiErrorCode =
  | 'location_outside_service_area'
  | 'deadline_in_past'
  | 'budget_required'
  | 'budget_not_applicable'
  | 'locations_pickup_dropoff_required';

export interface ApiError {
  /** HTTP status; 0 for a network failure. */
  readonly status: number;
  readonly code: string | null;
  /** First string of `message` (class-validator sends an array). */
  readonly message: string | null;
  /** 422 `location_outside_service_area` extra. */
  readonly pointType?: string;
}

/** Reads the API error body `{ statusCode, code, message, ...extra }` (F§3). */
export function apiErrorOf(err: unknown): ApiError {
  const status = err instanceof HttpErrorResponse ? err.status : 0;
  const body = err instanceof HttpErrorResponse ? (err.error as Record<string, unknown> | null) : null;
  const json = typeof body === 'object' && body !== null && !Array.isArray(body) ? body : {};
  const code = typeof json['code'] === 'string' ? json['code'] : null;
  const raw = json['message'];
  const first = Array.isArray(raw) ? raw.find((m) => typeof m === 'string') : raw;
  const message = typeof first === 'string' && first.trim() !== '' ? first : null;
  const out: ApiError = { status, code, message };
  return typeof json['pointType'] === 'string' ? { ...out, pointType: json['pointType'] } : out;
}

export const API_V1 = `${environment.apiBaseUrl}/api/v1`;

@Injectable({ providedIn: 'root' })
export class CustomerErrandsApi {
  private readonly http = inject(HttpClient);

  /** `GET /errands?status=A,B,…&limit=n`, newest created first. */
  list(statuses: readonly ErrandStatus[], limit: number): Promise<ErrandList> {
    return firstValueFrom(this.http.get<ErrandList>(`${API_V1}/errands?status=${statuses.join(',')}&limit=${limit}`));
  }

  /** `GET /errands/defaults` (Flexible caption). */
  defaults(): Promise<ErrandDefaults> {
    return firstValueFrom(this.http.get<ErrandDefaults>(`${API_V1}/errands/defaults`));
  }

  /** `POST /errands` → DRAFT. */
  create(body: CreateErrandBody): Promise<ErrandWrite> {
    return firstValueFrom(this.http.post<ErrandWrite>(`${API_V1}/errands`, body));
  }

  /** `POST /errands/:id/submit` → REQUESTED. */
  submit(id: string): Promise<ErrandWrite> {
    return firstValueFrom(this.http.post<ErrandWrite>(`${API_V1}/errands/${encodeURIComponent(id)}/submit`, null));
  }

  /** `PATCH /errands/:id/status { to: 'CANCELLED' }` (DRAFT → CANCELLED, OA-9). */
  cancelDraft(id: string): Promise<ErrandWrite> {
    return firstValueFrom(
      this.http.patch<ErrandWrite>(`${API_V1}/errands/${encodeURIComponent(id)}/status`, { to: 'CANCELLED' }),
    );
  }
}
