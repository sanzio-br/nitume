import { EntityManager } from 'typeorm';

/**
 * M-Pesa receipts recorded on manual payouts (refunds, their corrections,
 * and runner payout lines) are never reused across payouts. There is no
 * unique index (the receipts live in several columns and tables, and one
 * batched runner payout may cover several lines), so the check-then-insert
 * is serialised per
 * receipt with a transaction-scoped advisory lock: two admins recording the
 * same code at the same time wait on each other, and the second one sees the
 * first one's row (reviewer follow-up, round 5).
 */

/** Canonical form of a receipt: trimmed and upper-case. */
export const normalizeReference = (reference: string): string => reference.trim().toUpperCase();

/**
 * Takes the advisory lock of a receipt until the surrounding transaction
 * ends. Must run inside a transaction (`manager` from `transaction()`).
 */
export const lockPayoutReference = async (
  manager: EntityManager,
  reference: string,
): Promise<void> => {
  await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `payout_ref:${normalizeReference(reference)}`,
  ]);
};

/** One place a receipt is already recorded. */
export interface ReferenceUse {
  source: 'refund' | 'runner';
  /** Runner payout lines only: the runner, the line, its obligation and type. */
  runnerProfileId: string | null;
  lineId: string | null;
  obligationId: string | null;
  lineType: string | null;
}

/**
 * Every payout record carrying the receipt: refund payouts, refund
 * corrections, and runner payout lines (payouts, corrections, reversal codes,
 * re-sent payouts).
 */
export const referenceUses = async (
  manager: EntityManager,
  reference: string,
): Promise<ReferenceUse[]> =>
  manager.query(
    `SELECT 'refund' AS "source", NULL::uuid AS "runnerProfileId", NULL::uuid AS "lineId",
            NULL::uuid AS "obligationId", NULL::text AS "lineType"
       FROM "refund_reviews" WHERE UPPER("payoutReference") = $1
     UNION ALL
     SELECT 'refund', NULL::uuid, NULL::uuid, NULL::uuid, NULL::text
       FROM "refund_payout_corrections" WHERE UPPER("newReference") = $1
     UNION ALL
     SELECT 'runner', l."runnerProfileId", l.id, COALESCE(l."relatedLineId", l.id), l."lineType"::text
       FROM "runner_payout_lines" l WHERE UPPER(l."payoutReference") = $1
     LIMIT 100`,
    [normalizeReference(reference)],
  );

/** True when the receipt is already on any payout record (refund or runner). */
export const payoutReferenceUsed = async (
  manager: EntityManager,
  reference: string,
): Promise<boolean> => (await referenceUses(manager, reference)).length > 0;

/**
 * Whether a receipt may go on runner payout lines. Runner payouts are
 * batched (system design §6), so one M-Pesa payout can legitimately cover
 * several lines of the SAME runner. Refused when the receipt is on a refund,
 * on another runner's line, is a reversal code, or is already in the chain of
 * one of the obligations being paid or adjusted. A reversal code must be
 * unused everywhere.
 */
export const runnerReferenceConflict = (
  uses: ReferenceUse[],
  target: { runnerProfileId: string; obligationIds: string[]; isReversal: boolean },
): boolean => {
  if (target.isReversal) {
    return uses.length > 0;
  }
  return uses.some(
    (u) =>
      u.source === 'refund' ||
      u.runnerProfileId !== target.runnerProfileId ||
      u.lineType === 'reversal' ||
      (u.obligationId !== null && target.obligationIds.includes(u.obligationId)),
  );
};
