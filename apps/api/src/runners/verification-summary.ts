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

/**
 * Required checks (row 126, runner `_shared.md` §9): phone (approved at the
 * OTP sign-in), ID front and back (row 195: every ID image carries its side;
 * older ID rows without a side do not count), selfie, payment identity
 * (M-Pesa name match by ops).
 */
export const REQUIRED_CHECKS: ReadonlyArray<{ type: RunnerVerificationType; side: RunnerVerificationSide | null }> = [
  { type: RunnerVerificationType.PHONE, side: null },
  { type: RunnerVerificationType.GOVERNMENT_ID, side: RunnerVerificationSide.FRONT },
  { type: RunnerVerificationType.GOVERNMENT_ID, side: RunnerVerificationSide.BACK },
  { type: RunnerVerificationType.SELFIE, side: null },
  { type: RunnerVerificationType.PAYMENT_IDENTITY, side: null },
];

export const verificationSummaryOf = (
  rows: ReadonlyArray<Pick<RunnerVerification, 'verificationType' | 'side' | 'status' | 'createdAt'>>,
): VerificationSummary => {
  const newestFirst = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const checks = REQUIRED_CHECKS.map(({ type, side }) => {
    const row = newestFirst.find((r) => r.verificationType === type && (side === null || r.side === side));
    return { type, side, status: (row?.status ?? 'missing') as CheckStatus };
  });
  return { verified: checks.every((c) => c.status === VerificationStatus.APPROVED), checks };
};
