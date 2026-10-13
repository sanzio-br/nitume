import { EntityManager } from 'typeorm';

/**
 * M-Pesa receipts recorded on manual payouts (refunds and their
 * corrections) are never reused. There is no unique index (the receipts live
 * in several columns and tables), so the check-then-insert is serialised per
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

/** True when the receipt is already on a refund payout or a refund correction. */
export const refundReferenceUsed = async (
  manager: EntityManager,
  reference: string,
): Promise<boolean> => {
  const rows: unknown[] = await manager.query(
    `SELECT 1 FROM "refund_reviews" WHERE UPPER("payoutReference") = $1
     UNION ALL
     SELECT 1 FROM "refund_payout_corrections" WHERE UPPER("newReference") = $1
     LIMIT 1`,
    [normalizeReference(reference)],
  );
  return rows.length > 0;
};
