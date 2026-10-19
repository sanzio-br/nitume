import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  AssignErrandDto,
  AssignErrandResult,
  CreateRefundCorrectionDto,
  CreateRunnerPayoutCorrectionDto,
  EvidenceView,
  ListRunnerPayoutsResult,
  ReviewRunnerPayoutDto,
  RunnerPayoutDetail,
  RunnerPayoutItem,
  RunnerPayoutQuery,
  RunnerPayoutStatus,
  Dispute,
  Errand,
  ErrandCandidatesPage,
  ErrandRefundView,
  ExpireErrandResult,
  ListRefundsResult,
  MerchantDetailsDto,
  Quote,
  QuoteErrandResult,
  RefundDetail,
  RefundReview,
  RefundStatus,
  ErrandStatus,
  ErrandStatusHistoryEntry,
  ListErrandsResult,
  ListRunnersResult,
  ListVerificationsResult,
  OtpRequestResult,
  OtpVerifyResult,
  QuoteErrandDto,
  RefreshResult,
  ResolveDisputeResult,
  ResolveDisputeVerdict,
  ReviewVerificationDto,
  RunnerVerification,
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

  /** POST /auth/otp/email/request — emails a code to a provisioned admin. */
  requestEmailOtp(email: string) {
    return this.http.post<OtpRequestResult>(`${this.base}/auth/otp/email/request`, { email });
  }

  /** POST /auth/otp/email/verify — returns `{ user, tokens }` for the admin. */
  verifyEmailOtp(email: string, code: string) {
    return this.http.post<OtpVerifyResult>(`${this.base}/auth/otp/email/verify`, {
      email,
      code,
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

  /**
   * GET /errands — admins see all errands; optional status (one or several),
   * cursor pagination and `quoteRequested` (row 68: customer asked for a new quote).
   */
  listErrands(
    status?: ErrandStatus | ErrandStatus[] | null,
    cursor?: string | null,
    limit = 100,
    opts: { quoteRequested?: boolean } = {},
  ) {
    let params = errandFilter(status, opts.quoteRequested);
    if (cursor) params = params.set('cursor', cursor);
    params = params.set('limit', String(limit));
    return this.http.get<ListErrandsResult>(`${this.base}/errands`, { params });
  }

  /** GET /errands/count — `{ count }` with the same filters as the list. */
  countErrands(status?: ErrandStatus | ErrandStatus[] | null, quoteRequested?: boolean) {
    const params = errandFilter(status, quoteRequested);
    return this.http.get<{ count: number }>(`${this.base}/errands/count`, { params });
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

  /** POST /errands/:id/assign — PAYMENT_CONFIRMED → RUNNER_ASSIGNED only. */
  assignErrand(id: string, dto: AssignErrandDto) {
    return this.http.post<AssignErrandResult>(`${this.base}/errands/${id}/assign`, dto);
  }

  /**
   * GET /errands/:id/candidates (admin, N-20): runners the task may be
   * offered to, with `offline`, `tried`, `ineligibleReason` and the counts.
   * 409 `task_not_assignable` unless PAYMENT_CONFIRMED or RUNNER_ASSIGNED.
   */
  listErrandCandidates(id: string, limit = 100) {
    const params = new HttpParams().set('limit', String(limit));
    return this.http.get<ErrandCandidatesPage>(`${this.base}/errands/${id}/candidates`, {
      params,
    });
  }

  /**
   * POST /errands/:id/expire (admin, rows 187, 202, 203): "Expire task — no
   * runner available", reason required (10–500 after trimming).
   */
  expireErrand(id: string, reason: string) {
    return this.http.post<ExpireErrandResult>(`${this.base}/errands/${id}/expire`, { reason });
  }

  /**
   * POST /errands/:id/quote — first quote (REQUESTED → QUOTED) or a re-quote
   * of an expired quote (QUOTED or ACCEPTED; no status change).
   */
  quoteErrand(id: string, dto: QuoteErrandDto) {
    return this.http.post<QuoteErrandResult>(`${this.base}/errands/${id}/quote`, dto);
  }

  /** GET /errands/:id/quote — newest quote; 404 until quoted. */
  getQuote(id: string) {
    return this.http.get<Quote>(`${this.base}/errands/${id}/quote`);
  }

  /** PUT /errands/:id/merchant-details — admin sets the merchant Till/Paybill. */
  setMerchantDetails(id: string, body: MerchantDetailsDto) {
    return this.http.put<Errand>(`${this.base}/errands/${id}/merchant-details`, body);
  }

  /** GET /errands/:errandId/dispute — the dispute (claim `reason`, events). */
  getDispute(errandId: string) {
    return this.http.get<Dispute>(`${this.base}/errands/${errandId}/dispute`);
  }

  /** GET /errands/:errandId/refund — one review (cancellation first); 404 `refund_not_found`. */
  getErrandRefund(errandId: string) {
    return this.http.get<ErrandRefundView>(`${this.base}/errands/${errandId}/refund`);
  }

  /** GET /errands/:errandId/refunds — every review, newest first (row 71); never 404s on none. */
  listErrandRefunds(errandId: string) {
    return this.http.get<{ items: ErrandRefundView[] }>(`${this.base}/errands/${errandId}/refunds`);
  }

  /** GET /refunds — admin refund reviews, newest first. */
  listRefunds(status?: RefundStatus | null, cursor?: string | null, limit = 25) {
    let params = new HttpParams();
    if (status) params = params.set('status', status);
    if (cursor) params = params.set('cursor', cursor);
    params = params.set('limit', String(limit));
    return this.http.get<ListRefundsResult>(`${this.base}/refunds`, { params });
  }

  /** GET /refunds/count — `{ count }`, optionally for one status (sidebar badge). */
  countRefunds(status?: RefundStatus | null) {
    let params = new HttpParams();
    if (status) params = params.set('status', status);
    return this.http.get<{ count: number }>(`${this.base}/refunds/count`, { params });
  }

  /** GET /refunds/:id — review + errand summary, admin names, customer, paid breakdown. */
  getRefund(id: string) {
    return this.http.get<RefundDetail>(`${this.base}/refunds/${id}`);
  }

  /** PATCH /refunds/:id/decision — 0 closes with no refund, > 0 approves. */
  decideRefund(
    id: string,
    body: { refundAmount: number; note?: string; exposureOverrideNote?: string },
  ) {
    return this.http.patch<RefundReview>(`${this.base}/refunds/${id}/decision`, body);
  }

  /** POST /refunds/:id/mark-paid — records the manual M-Pesa payout. */
  markRefundPaid(id: string, body: { payoutReference: string }) {
    return this.http.post<RefundReview>(`${this.base}/refunds/${id}/mark-paid`, body);
  }

  /**
   * POST /refunds/:id/corrections — appends a payout correction, reversal or
   * new payout (row 100); 201 with the updated detail. The original payout
   * is never changed.
   */
  addRefundCorrection(id: string, body: CreateRefundCorrectionDto) {
    return this.http.post<RefundDetail>(`${this.base}/refunds/${id}/corrections`, body);
  }

  /** GET /runner-payouts — admin runner payout lines, newest first (row 107). */
  listRunnerPayouts(query: RunnerPayoutQuery, cursor?: string | null, limit = 25) {
    let params = new HttpParams();
    for (const key of ['status', 'kind', 'runnerProfileId', 'errandId'] as const) {
      const value = query[key];
      if (value) params = params.set(key, value);
    }
    if (cursor) params = params.set('cursor', cursor);
    params = params.set('limit', String(limit));
    return this.http.get<ListRunnerPayoutsResult>(`${this.base}/runner-payouts`, { params });
  }

  /** GET /runner-payouts/count — `{ count }`, optionally in one effective status (badge). */
  countRunnerPayouts(status?: RunnerPayoutStatus | null) {
    let params = new HttpParams();
    if (status) params = params.set('status', status);
    return this.http.get<{ count: number }>(`${this.base}/runner-payouts/count`, { params });
  }

  /** GET /runner-payouts/:id — line + runner contact, caps and adjustments. */
  getRunnerPayout(id: string) {
    return this.http.get<RunnerPayoutDetail>(`${this.base}/runner-payouts/${id}`);
  }

  /** POST /runner-payouts/:id/review — approve (capped) or reject an item reimbursement. */
  reviewRunnerPayout(id: string, body: ReviewRunnerPayoutDto) {
    return this.http.post<RunnerPayoutDetail>(`${this.base}/runner-payouts/${id}/review`, body);
  }

  /** POST /runner-payouts/:id/hold — an unpaid payable item line goes back to review. */
  holdRunnerPayout(id: string, note: string) {
    return this.http.post<RunnerPayoutDetail>(`${this.base}/runner-payouts/${id}/hold`, { note });
  }

  /** POST /runner-payouts/mark-paid — one M-Pesa payout for 1-50 payable lines of one runner. */
  markRunnerPayoutsPaid(lineIds: string[], payoutReference: string) {
    return this.http.post<{ items: RunnerPayoutItem[] }>(`${this.base}/runner-payouts/mark-paid`, {
      lineIds,
      payoutReference,
    });
  }

  /** POST /runner-payouts/:id/corrections — correction, reversal or re-sent payout (201 detail). */
  addRunnerPayoutCorrection(id: string, body: CreateRunnerPayoutCorrectionDto) {
    return this.http.post<RunnerPayoutDetail>(
      `${this.base}/runner-payouts/${id}/corrections`,
      body,
    );
  }

  /** GET /errands/:errandId/evidence — evidence with signed URLs (receipt image). */
  listErrandEvidence(errandId: string) {
    return this.http.get<EvidenceView[]>(`${this.base}/errands/${errandId}/evidence`);
  }

  /** GET /runners/verifications — admin verification inbox. */
  listVerifications(status?: string, cursor?: string | null, limit = 50) {
    let params = new HttpParams();
    if (status) params = params.set('status', status);
    if (cursor) params = params.set('cursor', cursor);
    params = params.set('limit', String(limit));
    return this.http.get<ListVerificationsResult>(`${this.base}/runners/verifications`, { params });
  }

  /** PATCH /runners/verifications/:id — admin reviews a verification. */
  reviewVerification(id: string, dto: ReviewVerificationDto) {
    return this.http.patch<RunnerVerification>(`${this.base}/runners/verifications/${id}`, dto);
  }

  /** GET /runners — admin runner directory (cursor-paginated). */
  listRunners(cursor?: string | null, limit = 100) {
    let params = new HttpParams();
    if (cursor) params = params.set('cursor', cursor);
    params = params.set('limit', String(limit));
    return this.http.get<ListRunnersResult>(`${this.base}/runners`, { params });
  }
}

/** `status=A,B` and `quoteRequested=true|false` query params for the errand list/count. */
function errandFilter(
  status: ErrandStatus | ErrandStatus[] | null | undefined,
  quoteRequested: boolean | undefined,
): HttpParams {
  let params = new HttpParams();
  const statuses = Array.isArray(status) ? status : status ? [status] : [];
  if (statuses.length) params = params.set('status', statuses.join(','));
  if (quoteRequested !== undefined) params = params.set('quoteRequested', String(quoteRequested));
  return params;
}
