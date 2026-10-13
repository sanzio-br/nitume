import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reviewer follow-up 8 (round 6), runner payout ledger hardening:
 * - review fields (`decisionNote`, `decidedByUserId`, `decidedAt`) change
 *   only with a review decision (on_hold -> payable | rejected) or a hold
 *   (payable -> on_hold), never when a payout is recorded; `reviewReason`
 *   changes only on a hold;
 * - an adjustment (correction, reversal, resent_payout) must point at an
 *   obligation (runner_fee or item_reimbursement) of the same runner and
 *   errand (BEFORE INSERT trigger).
 * Reversible: down restores the previous guard function.
 */
const GUARD_BODY = `BEGIN
         IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
           RAISE EXCEPTION 'runner_payout_lines is append-only (no %)', TG_OP;
         END IF;
         IF OLD."kind" IN ('correction', 'reversal', 'resent_payout') THEN
           RAISE EXCEPTION 'runner_payout_lines: adjustments are never updated';
         END IF;
         IF OLD."status" IN ('paid', 'rejected') THEN
           RAISE EXCEPTION 'runner_payout_lines: a % line is final', OLD."status";
         END IF;
         IF NEW."id" IS DISTINCT FROM OLD."id"
           OR NEW."runnerProfileId" IS DISTINCT FROM OLD."runnerProfileId"
           OR NEW."errandId" IS DISTINCT FROM OLD."errandId"
           OR NEW."kind" IS DISTINCT FROM OLD."kind"
           OR NEW."requestedAmount" IS DISTINCT FROM OLD."requestedAmount"
           OR NEW."capAmount" IS DISTINCT FROM OLD."capAmount"
           OR NEW."receiptEvidenceId" IS DISTINCT FROM OLD."receiptEvidenceId"
           OR NEW."relatedLineId" IS DISTINCT FROM OLD."relatedLineId"
           OR NEW."previousReference" IS DISTINCT FROM OLD."previousReference"
           OR NEW."previousAmount" IS DISTINCT FROM OLD."previousAmount"
           OR NEW."note" IS DISTINCT FROM OLD."note"
           OR NEW."createdByUserId" IS DISTINCT FROM OLD."createdByUserId"
           OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
           RAISE EXCEPTION 'runner_payout_lines: financial identity of a line is immutable';
         END IF;
         IF OLD."status" = 'on_hold' AND NEW."status" = 'payable' THEN
           IF NEW."amount" IS NULL OR NEW."decidedAt" IS NULL THEN
             RAISE EXCEPTION 'runner_payout_lines: an approved line needs an amount and a decision';
           END IF;
         ELSIF OLD."status" = 'on_hold' AND NEW."status" = 'rejected' THEN
           IF NEW."amount" IS NOT NULL OR NEW."decidedAt" IS NULL THEN
             RAISE EXCEPTION 'runner_payout_lines: a rejected line has no amount and needs a decision';
           END IF;
         ELSIF OLD."status" = 'payable' AND NEW."status" = 'paid' THEN
           IF NEW."amount" IS DISTINCT FROM OLD."amount" OR NEW."payoutReference" IS NULL
             OR NEW."paidAt" IS NULL THEN
             RAISE EXCEPTION 'runner_payout_lines: a payout keeps the amount and needs a receipt';
           END IF;
         ELSIF OLD."status" = 'payable' AND NEW."status" = 'on_hold' THEN
           IF OLD."kind" <> 'item_reimbursement' OR NEW."amount" IS NOT NULL
             OR NEW."reviewReason" IS NULL THEN
             RAISE EXCEPTION 'runner_payout_lines: only an unpaid item line goes back to review';
           END IF;
         ELSE
           RAISE EXCEPTION 'runner_payout_lines: % -> % is not allowed', OLD."status", NEW."status";
         END IF;
         IF NOT (OLD."status" = 'payable' AND NEW."status" = 'paid')
           AND (NEW."payoutReference" IS DISTINCT FROM OLD."payoutReference"
             OR NEW."paidAt" IS DISTINCT FROM OLD."paidAt"
             OR NEW."paidByUserId" IS DISTINCT FROM OLD."paidByUserId") THEN
           RAISE EXCEPTION 'runner_payout_lines: payout fields change only when the payout is recorded';
         END IF;
         IF NOT ((OLD."status" = 'on_hold' AND NEW."status" IN ('payable', 'rejected'))
             OR (OLD."status" = 'payable' AND NEW."status" = 'on_hold'))
           AND (NEW."decisionNote" IS DISTINCT FROM OLD."decisionNote"
             OR NEW."decidedByUserId" IS DISTINCT FROM OLD."decidedByUserId"
             OR NEW."decidedAt" IS DISTINCT FROM OLD."decidedAt") THEN
           RAISE EXCEPTION 'runner_payout_lines: review fields change only with a review decision or hold';
         END IF;
         IF NOT (OLD."status" = 'payable' AND NEW."status" = 'on_hold')
           AND NEW."reviewReason" IS DISTINCT FROM OLD."reviewReason" THEN
           RAISE EXCEPTION 'runner_payout_lines: the review reason changes only when a line goes back to review';
         END IF;
         RETURN NEW;
       END;
`;

const PREVIOUS_GUARD_BODY = `BEGIN
         IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
           RAISE EXCEPTION 'runner_payout_lines is append-only (no %)', TG_OP;
         END IF;
         IF OLD."kind" IN ('correction', 'reversal', 'resent_payout') THEN
           RAISE EXCEPTION 'runner_payout_lines: adjustments are never updated';
         END IF;
         IF OLD."status" IN ('paid', 'rejected') THEN
           RAISE EXCEPTION 'runner_payout_lines: a % line is final', OLD."status";
         END IF;
         IF NEW."id" IS DISTINCT FROM OLD."id"
           OR NEW."runnerProfileId" IS DISTINCT FROM OLD."runnerProfileId"
           OR NEW."errandId" IS DISTINCT FROM OLD."errandId"
           OR NEW."kind" IS DISTINCT FROM OLD."kind"
           OR NEW."requestedAmount" IS DISTINCT FROM OLD."requestedAmount"
           OR NEW."capAmount" IS DISTINCT FROM OLD."capAmount"
           OR NEW."receiptEvidenceId" IS DISTINCT FROM OLD."receiptEvidenceId"
           OR NEW."relatedLineId" IS DISTINCT FROM OLD."relatedLineId"
           OR NEW."previousReference" IS DISTINCT FROM OLD."previousReference"
           OR NEW."previousAmount" IS DISTINCT FROM OLD."previousAmount"
           OR NEW."note" IS DISTINCT FROM OLD."note"
           OR NEW."createdByUserId" IS DISTINCT FROM OLD."createdByUserId"
           OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
           RAISE EXCEPTION 'runner_payout_lines: financial identity of a line is immutable';
         END IF;
         IF OLD."status" = 'on_hold' AND NEW."status" = 'payable' THEN
           IF NEW."amount" IS NULL OR NEW."decidedAt" IS NULL THEN
             RAISE EXCEPTION 'runner_payout_lines: an approved line needs an amount and a decision';
           END IF;
         ELSIF OLD."status" = 'on_hold' AND NEW."status" = 'rejected' THEN
           IF NEW."amount" IS NOT NULL OR NEW."decidedAt" IS NULL THEN
             RAISE EXCEPTION 'runner_payout_lines: a rejected line has no amount and needs a decision';
           END IF;
         ELSIF OLD."status" = 'payable' AND NEW."status" = 'paid' THEN
           IF NEW."amount" IS DISTINCT FROM OLD."amount" OR NEW."payoutReference" IS NULL
             OR NEW."paidAt" IS NULL THEN
             RAISE EXCEPTION 'runner_payout_lines: a payout keeps the amount and needs a receipt';
           END IF;
         ELSIF OLD."status" = 'payable' AND NEW."status" = 'on_hold' THEN
           IF OLD."kind" <> 'item_reimbursement' OR NEW."amount" IS NOT NULL
             OR NEW."reviewReason" IS NULL THEN
             RAISE EXCEPTION 'runner_payout_lines: only an unpaid item line goes back to review';
           END IF;
         ELSE
           RAISE EXCEPTION 'runner_payout_lines: % -> % is not allowed', OLD."status", NEW."status";
         END IF;
         IF NOT (OLD."status" = 'payable' AND NEW."status" = 'paid')
           AND (NEW."payoutReference" IS DISTINCT FROM OLD."payoutReference"
             OR NEW."paidAt" IS DISTINCT FROM OLD."paidAt"
             OR NEW."paidByUserId" IS DISTINCT FROM OLD."paidByUserId") THEN
           RAISE EXCEPTION 'runner_payout_lines: payout fields change only when the payout is recorded';
         END IF;
         RETURN NEW;
       END;
`;

export class HardenRunnerPayoutLinesGuard1790101700000 implements MigrationInterface {
  name = 'HardenRunnerPayoutLinesGuard1790101700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE OR REPLACE FUNCTION "runner_payout_lines_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
       ${GUARD_BODY}       $$`,
    );
    await queryRunner.query(
      `CREATE FUNCTION "runner_payout_lines_adjustment_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
       DECLARE
         related RECORD;
       BEGIN
         IF NEW."kind" IN ('correction', 'reversal', 'resent_payout') THEN
           SELECT "runnerProfileId", "errandId", "kind" INTO related
             FROM "runner_payout_lines" WHERE id = NEW."relatedLineId";
           IF NOT FOUND OR related."kind" NOT IN ('runner_fee', 'item_reimbursement')
             OR related."runnerProfileId" <> NEW."runnerProfileId"
             OR related."errandId" <> NEW."errandId" THEN
             RAISE EXCEPTION 'runner_payout_lines: an adjustment must match the runner and errand of its obligation';
           END IF;
         END IF;
         RETURN NEW;
       END;
       $$`,
    );
    await queryRunner.query(
      `CREATE TRIGGER "TRG_runner_payout_lines_adjustment_guard" BEFORE INSERT ON "runner_payout_lines" FOR EACH ROW EXECUTE FUNCTION "runner_payout_lines_adjustment_guard"()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER "TRG_runner_payout_lines_adjustment_guard" ON "runner_payout_lines"`,
    );
    await queryRunner.query(`DROP FUNCTION "runner_payout_lines_adjustment_guard"()`);
    await queryRunner.query(
      `CREATE OR REPLACE FUNCTION "runner_payout_lines_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
       ${PREVIOUS_GUARD_BODY}       $$`,
    );
  }
}
