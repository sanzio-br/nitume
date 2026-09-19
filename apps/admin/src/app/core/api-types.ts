import { environment } from '../../environments/environment';

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
export type ErrandStatusString =
  | 'draft'
  | 'requested'
  | 'quoted'
  | 'accepted'
  | 'payment_pending'
  | 'payment_confirmed'
  | 'runner_assigned'
  | 'in_progress'
  | 'awaiting_customer'
  | 'completed'
  | 'confirmed'
  | 'settled'
  | 'cancelled'
  | 'failed'
  | 'disputed'
  | 'expired';

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

// --- Runners ---
export type RunnerAvailability = 'online' | 'offline' | 'busy';
export type VerificationStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'in_review';

export interface RunnerSkill {
  id: string;
  skill: string;
}

export interface RunnerListItem {
  id: string;
  userId: string;
  verificationLevel?: string;
  avgRating?: string;
  errandsCompleted?: number;
  availability?: RunnerAvailability;
  skillsCount?: number;
  createdAt: string;
  user?: {
    id: string;
    phone?: string;
    firstName?: string | null;
    lastName?: string | null;
    status?: string;
  };
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
export type AuthTokens = TokenPair Waiting; // alias: verify/refresh both return a TokenPair
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
}


// --- Alias: auth-store/auth.service expect `AuthTokens` (== TokenPair) ---
export type AuthTokens = TokenPair;
