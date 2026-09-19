/**
 * Typed response shapes mirrored from the committed `apps/api` surface
 * (the single source of truth for route paths, request/response shapes,
 * and the acting-role header contract). Do not invent paths or fields the
 * API does not actually return — anything unsupported stays `unknown` and
 * is surfaced in the UI as-is rather than fabricated.
 */

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
}

export interface ErrandListItem {
  id: string;
  category: string;
  description: string;
  status: ErrandStatusString;
  budget: string;
  quotedPrice?: string | null;
  urgency?: string;
  deadlineAt?: string | null;
  runnerProfileId?: string | null;
  createdAt: string;
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

/** Verdicts for `PATCH /errands/:id/resolve-dispute` (§3.3 DISPUTED → CONFIRMED/CANCELLED). */
export type ResolveDisputeVerdict = 'runner' | 'customer';

export interface ResolveDisputeResult {
  errand: Errand;
  history: ErrandStatusHistoryEntry;
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

export interface RunnerVerification {
  id: string;
  runnerProfileId: string;
  verificationType: string;
  documentKey?: string | null;
  status: VerificationStatus;
  submittedAt: string;
  reviewedBy?: string | null;
  reviewerNote?: string | null;
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
