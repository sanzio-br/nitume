import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Owner answer row 152 (2026-10-16, option b): an item reimbursement keeps
 * the runner's max_purchase_advance in force when the obligation was created
 * (at CONFIRMED or at the runner's claim). The ordinary approval ceiling uses
 * that stored limit, so a later change of the runner's limit never lifts or
 * lowers a review already open (created at KES 3,000, limit later 5,000:
 * the ceiling stays 3,000). Lines created before this column have NULL and
 * fall back to the runner's current limit. The value is part of the line's
 * financial identity: the ledger guard refuses to change it. Reversible.
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
           OR NEW."purchaseLimitAtCreation" IS DISTINCT FROM OLD."purchaseLimitAtCreation"
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

export class AddRunnerPayoutLinePurchaseLimit1790102100000 implements MigrationInterface {
  name = 'AddRunnerPayoutLinePurchaseLimit1790102100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "runner_payout_lines" ADD "purchaseLimitAtCreation" numeric(12,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "runner_payout_lines" ADD CONSTRAINT "CHK_runner_payout_lines_purchase_limit" CHECK ("purchaseLimitAtCreation" IS NULL OR ("purchaseLimitAtCreation" >= 0 AND "kind" = 'item_reimbursement'))`,
    );
    await queryRunner.query(
      `CREATE OR REPLACE FUNCTION "runner_payout_lines_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
       ${GUARD_BODY}       $$`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE OR REPLACE FUNCTION "runner_payout_lines_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
       ${PREVIOUS_GUARD_BODY}       $$`,
    );
    await queryRunner.query(
      `ALTER TABLE "runner_payout_lines" DROP CONSTRAINT "CHK_runner_payout_lines_purchase_limit"`,
    );
    await queryRunner.query(`ALTER TABLE "runner_payout_lines" DROP COLUMN "purchaseLimitAtCreation"`);
  }
}
