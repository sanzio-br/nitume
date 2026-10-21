import { RunnerVerificationType, VerificationStatus } from '../common/enums';
import { RunnerVerification, RunnerVerificationSide } from './runner-verification.entity';

/** One required check's state; `missing` = no record yet. */
export type CheckStatus = VerificationStatus | 'missing';

export interface VerificationCheck {
  type: RunnerVerificationType;
  /** `front` | `back` for the two ID images, else null. */
  side: RunnerVerificationSide | null;
  status: CheckStatus;
}

/**
 * RA-8 / row 126 (owner, 2026-10-13): "verified only when all required
 * checks are approved". `checks` is always the five required checks in this
 * order; the newest record of each check wins (a re-upload after a
 * rejection replaces it).
 */
export interface VerificationSummary {
  verified: boolean;
  checks: VerificationCheck[];
}

type CheckRef = { type: RunnerVerificationType; side: RunnerVerificationSide | null };
type CheckRow = Pick<RunnerVerification, 'verificationType' | 'side' | 'status' | 'createdAt'>;

const ID_FRONT: CheckRef = { type: RunnerVerificationType.GOVERNMENT_ID, side: RunnerVerificationSide.FRONT };
const ID_BACK: CheckRef = { type: RunnerVerificationType.GOVERNMENT_ID, side: RunnerVerificationSide.BACK };
const SELFIE: CheckRef = { type: RunnerVerificationType.SELFIE, side: null };

/**
 * Required checks (row 126, runner `_shared.md` §9): phone (approved at the
 * OTP sign-in), ID front and back (row 195: every ID image carries its side;
 * older ID rows without a side do not count), selfie, payment identity
 * (M-Pesa name match by ops).
 */
export const REQUIRED_CHECKS: ReadonlyArray<CheckRef> = [
  { type: RunnerVerificationType.PHONE, side: null },
  ID_FRONT,
  ID_BACK,
  SELFIE,
  { type: RunnerVerificationType.PAYMENT_IDENTITY, side: null },
];

/**
 * Row 261 (owner, 2026-10-21, AQ-36): the checks behind Level 2
 * (`2_id_verified`): ID front, ID back and selfie, the newest record of
 * each approved. The only definition of "ID verified" in the API.
 */
export const ID_VERIFIED_CHECKS: ReadonlyArray<CheckRef> = [ID_FRONT, ID_BACK, SELFIE];

/** The newest record of each given check (row 195: an ID row without a side matches no side). */
const latestStatuses = (rows: ReadonlyArray<CheckRow>, refs: ReadonlyArray<CheckRef>): VerificationCheck[] => {
  const newestFirst = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return refs.map(({ type, side }) => {
    const row = newestFirst.find((r) => r.verificationType === type && (side === null || r.side === side));
    return { type, side, status: (row?.status ?? 'missing') as CheckStatus };
  });
};

const allApproved = (checks: ReadonlyArray<VerificationCheck>): boolean =>
  checks.every((c) => c.status === VerificationStatus.APPROVED);

export const verificationSummaryOf = (rows: ReadonlyArray<CheckRow>): VerificationSummary => {
  const checks = latestStatuses(rows, REQUIRED_CHECKS);
  return { verified: allApproved(checks), checks };
};

/**
 * Row 261: true when the newest ID front, ID back and selfie records are all
 * approved. Every required-check gate (`verified`) implies this, since
 * REQUIRED_CHECKS contains ID_VERIFIED_CHECKS.
 */
export const meetsIdVerifiedRule = (rows: ReadonlyArray<CheckRow>): boolean =>
  allApproved(latestStatuses(rows, ID_VERIFIED_CHECKS));

/** Verification types whose approval can complete the Level 2 rule. */
export const ID_VERIFIED_TYPES: ReadonlySet<RunnerVerificationType> = new Set(ID_VERIFIED_CHECKS.map((c) => c.type));
