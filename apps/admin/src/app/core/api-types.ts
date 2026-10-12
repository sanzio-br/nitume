/**
 * Typed response shapes mirrored from the committed `apps/api` surface
 * (the single source of truth for route paths, request/response shapes,
 * and the acting-role header contract). Do not invent paths or fields the
 * API does not actually return — anything unsupported stays `unknown` and
 * is surfaced in the UI as-is rather than fabricated.
 */

// --- Matching / Assignment ---
export interface AssignErrandDto {
  runnerProfileId: string;
  note?: string;
}

/**
 * `POST /errands/:id/quote` body. Amounts are JSON numbers (the API DTO uses
 * `@IsNumber`); empty components are omitted, never sent as `""`. Currency
 * is left to the API default (`KES`). `expiresAt` is ISO 8601 with offset.
 */
export interface QuoteErrandDto {
  total: number;
  baseFee?: number;
  distanceFee?: number;
  timeFee?: number;
  urgencyFee?: number;
  complexityFee?: number;
  premiumFee?: number;
  expiresAt: string;
  note?: string;
}

export const QUOTE_COMPONENTS = [
  'baseFee',
  'distanceFee',
  'timeFee',
  'urgencyFee',
  'complexityFee',
  'premiumFee',
] as const;
export type QuoteComponent = (typeof QUOTE_COMPONENTS)[number];

/** Newest `quotes` row (`GET /errands/:id/quote`). Amounts are decimal strings. */
export interface Quote {
  id: string;
  errandId: string;
  baseFee: string;
  distanceFee: string;
  timeFee: string;
  urgencyFee: string;
  complexityFee: string;
  premiumFee: string;
  total: string;
  currency: string;
  expiresAt: string | null;
  acceptedAt?: string | null;
  createdAt: string;
}

/** `POST /errands/:id/quote`: `history` is null on a re-quote (no status change). */
export interface QuoteErrandResult {
  errand: Errand;
  history: ErrandStatusHistoryEntry | null;
  quote: Quote;
}

/** `POST /errands/:id/assign`. */
export interface AssignErrandResult {
  errand: Errand;
  history: ErrandStatusHistoryEntry;
  assignment: { id: string; runnerProfileId: string; status: string };
}

/** `PUT /errands/:id/merchant-details`: exactly one of Till / Paybill. */
export type MerchantDetailsDto =
  | { merchantName: string; tillNumber: string }
  | { merchantName: string; paybillNumber: string; accountReference?: string };

export interface ReviewVerificationDto {
  decision: 'approved' | 'rejected';
  reviewerNote?: string;
}

// --- Auth ---
export interface OtpRequestResult {
  message: string;
  /** Minutes until the code expires. */
  expiresInMinutes?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface UserRolePair {
  /** User's canonical role from the JWT. */
  role: 'customer' | 'runner' | 'admin';
}

/**
 * Response of `POST /auth/otp/verify` — `{ user, tokens }`.
 * `user.actingRoles` lists every role this account may act as (drives the
 * acting-role switcher in the shell).
 */
export interface OtpVerifyResult {
  user: {
    id: string;
    phone: string;
    role: string;
    actingRoles?: string[];
  } & Record<string, unknown>;
  tokens: TokenPair;
}

// --- Users / admin self ---
export interface AdminUser {
  id: string;
  phone?: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  status?: string;
  createdAt?: string;
}

// --- Errands(task queue) ---
/**
 * Errand statuses VERBATIM from `apps/api` `ErrandStatus` (the state machine
 * in §3.3): uppercase enum strings from the NestJS surface. The admin client
 * does not translate case — the API is the single source of truth.
 */
export type ErrandStatusString =
  | 'DRAFT'
  | 'REQUESTED'
  | 'QUOTED'
  | 'ACCEPTED'
  | 'PAYMENT_CONFIRMED'
  | 'RUNNER_ASSIGNED'
  | 'RUNNER_EN_ROUTE'
  | 'ARRIVED'
  | 'IN_PROGRESS'
  | 'AWAITING_CUSTOMER'
  | 'COMPLETED'
  | 'CONFIRMED'
  | 'SETTLED'
  | 'CANCELLED'
  | 'FAILED'
  | 'DISPUTED'
  | 'EXPIRED';

export interface ErrandLocation {
  pointType: 'pickup' | 'dropoff' | 'task_site';
  lat: number;
  lon: number;
  addressText: string;
  placeId?: string;
}

export interface ErrandItem {
  name: string;
  quantity?: number;
  unit?: string;
  notes?: string;
}

export interface Errand {
  id: string;
  customerId: string;
  /** `NT-1234` (round 3). */
  reference?: string;
  title?: string | null;
  category: string;
  description: string;
  status: ErrandStatusString;
  budget: string;
  quotedPrice?: string | null;
  finalPrice?: string | null;
  currency?: string;
  deadlineAt?: string | null;
  urgency?: string;
  createdAt: string;
  updatedAt: string;
  locations?: ErrandLocation[];
  items?: ErrandItem[];
  runnerProfileId?: string | null;
  // Merchant Till/Paybill for the merchant_direct route (rows 42-44).
  merchantName?: string | null;
  merchantTillNumber?: string | null;
  merchantPaybillNumber?: string | null;
  merchantAccountReference?: string | null;
  merchantDetailsAvailable?: boolean;
  /**
   * When existing merchant details were last changed (row 80, N-14); set by
   * the API on a change. TODO(owner-answers-4): optional until merged.
   */
  merchantDetailsUpdatedAt?: string | null;
  /** Newest quote expiry (N-5); null when not quoted. */
  quoteExpiresAt?: string | null;
  /** ACCEPTED with an unaccepted admin re-quote (row 72). */
  quoteAcceptanceRequired?: boolean;
  /**
   * When the customer asked for a new quote after expiry (row 68, N-13);
   * null when none is pending. TODO(owner-answers-4): optional until merged.
   */
  quoteRequestedAt?: string | null;
}

export interface ErrandListItem {
  id: string;
  title?: string | null;
  category: string;
  description: string;
  status: ErrandStatusString;
  budget: string;
  quotedPrice?: string | null;
  urgency?: string;
  deadlineAt?: string | null;
  runnerProfileId?: string | null;
  createdAt: string;
  /** Newest quote expiry (N-5); null when not quoted. */
  quoteExpiresAt?: string | null;
  /** Pending customer request for a new quote (row 68). TODO(owner-answers-4). */
  quoteRequestedAt?: string | null;
}

export interface ListErrandsResult {
  items: ErrandListItem[];
  nextCursor: string | null;
}

export interface ErrandStatusHistoryEntry {
  id: string;
  errandId: string;
  fromStatus?: string | null;
  toStatus: string;
  actorType: string;
  actorId?: string | null;
  note?: string | null;
  createdAt: string;
}

export interface ErrandDetail {
  errand: Errand;
  history: ErrandStatusHistoryEntry[];
}

/** Verdicts for `PATCH /errands/:id/resolve-dispute` (§3.3 DISPUTED → COMPLETED (runner) / CANCELLED (customer)). */
export type ResolveDisputeVerdict = 'runner' | 'customer';

export interface ResolveDisputeResult {
  errand: Errand;
  history: ErrandStatusHistoryEntry;
}

// --- Disputes ---
export interface DisputeEvent {
  id: string;
  disputeId?: string;
  type?: string;
  createdAt: string;
  [key: string]: unknown;
}

/** `GET /errands/:errandId/dispute`. */
export interface Dispute {
  id: string;
  errandId: string;
  openedBy: string;
  /** The customer's claim. */
  reason: string;
  status: string;
  resolution: string | null;
  resolvedBy: string | null;
  createdAt: string;
  updatedAt?: string;
  events?: DisputeEvent[];
  // Outcome (row 79). TODO(owner-answers-4): optional until merged.
  /** Verdict of the resolution, or null while open. */
  verdict?: 'runner_favourable' | 'customer_favourable' | null;
  /** When it was resolved, or null while open. */
  resolvedAt?: string | null;
}

// --- Refund reviews (rows 37, 48, 54, 71) ---
export type RefundStatus = 'pending_review' | 'approved' | 'no_refund' | 'refunded';
export type RefundTrigger =
  | 'price_change_rejected'
  | 'dispute_customer_favourable'
  | 'cancelled_after_payment'
  | 'price_change_decrease'
  // Row 102 (N-16): a paid task that ended EXPIRED or FAILED.
  | 'expired_after_payment'
  | 'failed_after_payment';

/** Bare `refund_reviews` row (decision / mark-paid responses). Amounts: decimal strings. */
export interface RefundReview {
  id: string;
  errandId: string;
  priceChangeRequestId?: string | null;
  trigger: RefundTrigger | string;
  amountPaid: string;
  refundAmount: string | null;
  status: RefundStatus | string;
  decisionNote?: string | null;
  decidedByUserId?: string | null;
  decidedAt?: string | null;
  payoutReference?: string | null;
  paidByUserId?: string | null;
  paidAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  // Cumulative position on the task (rows 81, 87; N-9). Admin refund responses only.
  // TODO(owner-answers-4): optional until feat/api-owner-answers-4 is on main.
  /** Highest refund an admin may approve now; null once decided. */
  refundCeiling?: string | null;
  /** Refunds of the task's other approved/refunded reviews. */
  alreadyRefunded?: string;
  /** What is still refundable on the task after every approved/refunded review. */
  remainingRefundable?: string;
  /** Every completed STK amount paid to Nitume for the task. */
  totalPaidToNitume?: string;
}

/** An admin who decided / paid a refund (N-2). */
export interface AdminRef {
  id: string;
  displayName: string | null;
}

/** Errand summary on admin refund items (N-1). */
export interface RefundErrandSummary {
  id: string;
  reference?: string;
  title: string | null;
  description: string;
  category: string;
  status: ErrandStatusString;
}

/** `GET /refunds` item: the review plus errand summary and admin names (N-1, N-2). */
export interface RefundListItem extends RefundReview {
  /** Null only when the errand row is gone. */
  errand: RefundErrandSummary | null;
  decidedBy: AdminRef | null;
  paidBy: AdminRef | null;
}

export interface PaidBreakdown {
  serviceAndRunnerFee: string;
  itemAmountToNitume: string;
  priceChangeDifferences: string;
  totalPaidToNitume: string;
  merchantDirectAmount: string;
}

/** `GET /refunds/:id`: list item + customer contact, paid breakdown, sibling reviews. */
export interface RefundDetail extends RefundListItem {
  customer: {
    userId: string;
    displayName: string | null;
    shortName: string | null;
    phone: string | null;
    mpesaPhone: string | null;
  } | null;
  paid: PaidBreakdown;
  otherReviews: Pick<RefundReview, 'id' | 'trigger' | 'status' | 'amountPaid' | 'refundAmount'>[];
}

export interface ListRefundsResult {
  items: RefundListItem[];
  nextCursor: string | null;
}

/** `GET /errands/:id/refund` and items of `GET /errands/:id/refunds`. */
export interface ErrandRefundView {
  id: string;
  errandId: string;
  trigger: RefundTrigger | string;
  priceChangeRequestId?: string | null;
  status: RefundStatus | string;
  amountPaid: string;
  refundAmount: string | null;
  payoutReference?: string | null;
  createdAt: string;
  decidedAt?: string | null;
  paidAt?: string | null;
}

// --- Runners ---
export type RunnerAvailability = 'online' | 'offline' | 'busy';
export type VerificationStatus = 'pending' | 'approved' | 'rejected' | 'in_review';

export interface RunnerSkill {
  id: string;
  skill: string;
}

/**
 * Admin runner-directory row (`GET /runners` → `listForAdmin`). The API
 * returns the full `RunnerProfile` entity plus a skills counter, so the
 * trust/load metrics below arrive as decimal strings (numeric columns).
 */
export interface RunnerListItem {
  id: string;
  userId: string;
  verificationLevel?: string;
  trustScore?: string;
  completionRate?: string;
  onTimeRate?: string;
  cancellationRate?: string;
  avgRating?: string;
  errandsCompleted?: number;
  maxPurchaseAdvance?: string;
  availability?: RunnerAvailability;
  lastPingAt?: string | null;
  skillsCount?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface ListRunnersResult {
  items: RunnerListItem[];
  nextCursor: string | null;
}

export interface ListVerificationsResult {
  items: RunnerVerification[];
  nextCursor: string | null;
}

export interface RunnerVerification {
  id: string;
  runnerProfileId: string;
  verificationType: string;
  documentKey?: string | null;
  status: VerificationStatus;
  submittedAt: string;
  reviewedBy?: string | null;
  reviewerNote?: string | null;
  runnerProfile?: {
    id: string;
    userId: string;
    availability?: string;
  };
  user?: {
    id: string;
    phone: string;
    email: string | null;
  };
}

export interface RunnerDetail {
  id: string;
  userId: string;
  availability: RunnerAvailability;
  verificationLevel: string;
  avgRating: string;
  errandsCompleted: number;
  skills: RunnerSkill[];
  serviceAreas: string[];
  verifications: RunnerVerification[];
}

// --- Payments ---
export interface PaymentRecord {
  id: string;
  errandId: string;
  reference: string;
  status: string;
  amount?: string;
  currency?: string;
  initiatedAt?: string;
  settledAt?: string | null;
}

export interface ListPaymentsResult {
  payment: PaymentRecord | null;
  transactions?: unknown[];
}

// --- Acting-role contract + aliases consumed by the shell ---
/** `x-nitume-acting-role` header value this admin surface sends on every call. */
export const ACTING_ROLE_ADMIN = 'admin';

export type ActingRole = 'admin' | 'runner' | 'customer';

export interface RefreshResult {
  user: UserMe;
  tokens: TokenPair;
}
export type OtpVerifyResponse = OtpVerifyResult;
export type RefreshResponse = RefreshResult;
export type ErrandStatus = ErrandStatusString;
export type UserMe = AdminUser;
export interface AuthState {
  tokens: TokenPair | null;
  user: UserMe | null;
  actingRole: ActingRole;
  /** UI-only lifecycle of the admin session (never sent to the API). */
  status: AuthStatus;
}

export type AuthStatus =
  'idle' | 'requesting' | 'verifying' | 'authenticated' | 'refreshing' | 'expired';

// --- Alias: auth-store/auth.service expect `AuthTokens` (== TokenPair) ---

export type AuthTokens = TokenPair;
