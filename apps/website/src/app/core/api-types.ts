/** Minimal typed response shapes for the public Nitume website. Mirrored from
 *  the committed `apps/api` surface — never invent fields the API lacks. */

export interface OtpRequestResult {
  message: string;
}

/** `GET /users/me`. `role` and `status` are strings on the wire; narrow
 *  `role` with `roleOf()` (core/auth/role-routing.ts), never cast. */
export interface UserMe {
  id: string;
  phone: string;
  email?: string | null;
  displayName: string | null;
  role: string;
  status: string;
  createdAt?: string;
}

/** `POST /auth/web/otp/verify` (PR #20). The refresh token is the httpOnly
 *  `nitume_rt` cookie and never appears here. */
export interface WebSession {
  user: UserMe;
  tokens: { accessToken: string };
}

/** `POST /auth/web/refresh` (PR #20): the cookie is rotated by the API. */
export interface WebRefreshResult {
  accessToken: string;
}

/** One required check of `GET /runners/me` `verification.checks`. */
export interface RunnerVerificationCheck {
  type: string;
  side: 'front' | 'back' | null;
  status: string;
}

/** `GET /runners/me` (only the fields #6 reads). */
export interface RunnerMe {
  verification: {
    verified: boolean;
    checks?: RunnerVerificationCheck[];
    /** Absent on older API builds (auth-foundation §6.3 step 3). */
    level2Missing?: string[];
  };
}

/** One record of `GET /runners/me/verifications` (fallback only). */
export interface RunnerVerificationRecord {
  verificationType: string;
  status: string;
  side?: 'front' | 'back' | null;
  createdAt?: string | null;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface OtpVerifyResult {
  user: UserMe;
  tokens: TokenPair;
}

export interface RegisterResult {
  user: UserMe;
}