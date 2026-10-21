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
  /**
   * N-L1 / RN-L1: the Level 2 checks (row 261) whose newest record is not
   * approved, in ID front, ID back, selfie order; empty when the runner meets
   * the Level 2 rule. Computed here so clients never re-implement the rule
   * (row 263 unlabelled IDs included).
   */
  level2Missing: Level2Check[];
}

/** A Level 2 check (row 261) as named in `level2Missing`. */
export type Level2Check = 'government_id_front' | 'government_id_back' | 'selfie';

type CheckRef = { type: RunnerVerificationType; side: RunnerVerificationSide | null };
type CheckRow = Pick<RunnerVerification, 'verificationType' | 'side' | 'status' | 'createdAt'>;

const ID_FRONT: CheckRef = { type: RunnerVerificationType.GOVERNMENT_ID, side: RunnerVerificationSide.FRONT };
const ID_BACK: CheckRef = { type: RunnerVerificationType.GOVERNMENT_ID, side: RunnerVerificationSide.BACK };
const SELFIE: CheckRef = { type: RunnerVerificationType.SELFIE, side: null };

/**
 * Required checks (row 126, runner `_shared.md` §9): phone (approved at the
 * OTP sign-in), ID front and back (row 195: every ID image carries its side;
 * older unlabelled ID rows fill a side only as in `idSideStatuses`, row 263),
 * selfie, payment identity (M-Pesa name match by ops).
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

/**
 * Row 263 (owner, 2026-10-21, AQ-38): the status of ID front and ID back.
 * A side with a labelled record takes its newest labelled record (labelled
 * records always win over unlabelled ones). A side with no labelled record
 * is filled by an approved unlabelled government_id record (rows from
 * before row 195), each such record filling one side only: two distinct
 * approved unlabelled records fill front and back; one approved unlabelled
 * record plus a labelled side fills the other side. Unlabelled records that
 * are pending or rejected fill nothing (the side stays `missing`). With one
 * unlabelled record and both sides unlabelled, front is filled first.
 */
const idSideStatuses = (newestFirst: ReadonlyArray<CheckRow>): Record<RunnerVerificationSide, CheckStatus> => {
  const ids = newestFirst.filter((r) => r.verificationType === RunnerVerificationType.GOVERNMENT_ID);
  let spare = ids.filter((r) => !r.side && r.status === VerificationStatus.APPROVED).length;
  const statusOf = (side: RunnerVerificationSide): CheckStatus => {
    const labelled = ids.find((r) => r.side === side);
    if (labelled) {
      return labelled.status;
    }
    if (spare > 0) {
      spare -= 1;
      return VerificationStatus.APPROVED;
    }
    return 'missing';
  };
  // A labelled side never spends a spare record, so the order only matters when both sides are unlabelled.
  const front = statusOf(RunnerVerificationSide.FRONT);
  const back = statusOf(RunnerVerificationSide.BACK);
  return { [RunnerVerificationSide.FRONT]: front, [RunnerVerificationSide.BACK]: back };
};

/** The newest record of each given check; ID sides as in `idSideStatuses` (rows 195, 263). */
const latestStatuses = (rows: ReadonlyArray<CheckRow>, refs: ReadonlyArray<CheckRef>): VerificationCheck[] => {
  const newestFirst = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const sides = idSideStatuses(newestFirst);
  return refs.map(({ type, side }) => {
    if (type === RunnerVerificationType.GOVERNMENT_ID && side) {
      return { type, side, status: sides[side] };
    }
    const row = newestFirst.find((r) => r.verificationType === type && (side === null || r.side === side));
    return { type, side, status: (row?.status ?? 'missing') as CheckStatus };
  });
};

const allApproved = (checks: ReadonlyArray<VerificationCheck>): boolean =>
  checks.every((c) => c.status === VerificationStatus.APPROVED);

const level2NameOf = ({ type, side }: CheckRef): Level2Check =>
  type === RunnerVerificationType.SELFIE ? 'selfie' : side === RunnerVerificationSide.BACK ? 'government_id_back' : 'government_id_front';

/** N-L1: the Level 2 checks not met, from the same statuses as `meetsIdVerifiedRule`. */
export const level2MissingOf = (rows: ReadonlyArray<CheckRow>): Level2Check[] =>
  latestStatuses(rows, ID_VERIFIED_CHECKS)
    .filter((c) => c.status !== VerificationStatus.APPROVED)
    .map(level2NameOf);

export const verificationSummaryOf = (rows: ReadonlyArray<CheckRow>): VerificationSummary => {
  const checks = latestStatuses(rows, REQUIRED_CHECKS);
  return { verified: allApproved(checks), checks, level2Missing: level2MissingOf(rows) };
};

/**
 * Row 261: true when the newest ID front, ID back and selfie records are all
 * approved. Every required-check gate (`verified`) implies this, since
 * REQUIRED_CHECKS contains ID_VERIFIED_CHECKS.
 */
export const meetsIdVerifiedRule = (rows: ReadonlyArray<CheckRow>): boolean => level2MissingOf(rows).length === 0;

/** Verification types whose approval can complete the Level 2 rule. */
export const ID_VERIFIED_TYPES: ReadonlySet<RunnerVerificationType> = new Set(ID_VERIFIED_CHECKS.map((c) => c.type));
