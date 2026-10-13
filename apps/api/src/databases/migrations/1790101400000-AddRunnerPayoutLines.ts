import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Owner answer row 107 (2026-10-13): "Approve the runner payout ledger table.
 * Build it now. It must support distinct financial lines for runner fee, item
 * reimbursement, corrections, reversals, and re-sent payouts."
 *
 * `runner_payout_lines`: one row per financial line; balances are derived,
 * never stored (no wallet/escrow). Integrity in the database:
 * - one obligation per errand and type (`runner_fee`, `item_reimbursement`):
 *   partial unique index, so a line is never created twice;
 * - no DELETE and no TRUNCATE (triggers);
 * - adjustments (`correction`, `reversal`, `resend`) are never updated;
 * - an obligation's identity (runner, errand, type, requested amount, cap,
 *   receipt, note, creator, created time) never changes; its lifecycle only
 *   moves on_hold -> payable | rejected, payable -> paid, or (item
 *   line, unpaid) payable -> on_hold; `paid` and `rejected` are final,
 *   and the payout receipt can only be set by the payable -> paid step.
 * Reversible.
 */
export class AddRunnerPayoutLines1790101400000 implements MigrationInterface {
  name = 'AddRunnerPayoutLines1790101400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."runner_payout_line_type_enum" AS ENUM('runner_fee', 'item_reimbursement', 'correction', 'reversal', 'resent_payout')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."runner_payout_line_status_enum" AS ENUM('on_hold', 'payable', 'paid', 'rejected', 'recorded')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."runner_payout_review_reason_enum" AS ENUM('receipt_missing', 'receipt_mismatch', 'out_of_pocket_claim', 'over_purchase_limit')`,
    );
    await queryRunner.query(
      `CREATE TABLE "runner_payout_lines" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "runnerProfileId" uuid NOT NULL,
        "errandId" uuid NOT NULL,
        "kind" "public"."runner_payout_line_type_enum" NOT NULL,
        "status" "public"."runner_payout_line_status_enum" NOT NULL,
        "requestedAmount" numeric(12,2),
        "amount" numeric(12,2),
        "capAmount" numeric(12,2),
        "reviewReason" "public"."runner_payout_review_reason_enum",
        "receiptEvidenceId" uuid,
        "relatedLineId" uuid,
        "previousReference" character varying(64),
        "previousAmount" numeric(12,2),
        "payoutReference" character varying(64),
        "paidAt" TIMESTAMP WITH TIME ZONE,
        "paidByUserId" uuid,
        "note" text,
        "decisionNote" text,
        "decidedByUserId" uuid,
        "decidedAt" TIMESTAMP WITH TIME ZONE,
        "createdByUserId" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_runner_payout_lines" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_runner_payout_lines_shape" CHECK (
          ("kind" IN ('runner_fee', 'item_reimbursement')
             AND "relatedLineId" IS NULL AND "status" <> 'recorded' AND "requestedAmount" IS NOT NULL)
          OR
          ("kind" IN ('correction', 'reversal', 'resent_payout')
             AND "relatedLineId" IS NOT NULL AND "status" = 'recorded' AND "note" IS NOT NULL)
        ),
        CONSTRAINT "CHK_runner_payout_lines_amounts" CHECK (
          COALESCE("requestedAmount", 0) >= 0 AND COALESCE("amount", 0) >= 0
          AND COALESCE("capAmount", 0) >= 0 AND COALESCE("previousAmount", 0) >= 0
        )
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_runner_payout_lines_obligation" ON "runner_payout_lines" ("errandId", "kind") WHERE "kind" IN ('runner_fee', 'item_reimbursement')`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_runner_payout_lines_runner" ON "runner_payout_lines" ("runnerProfileId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_runner_payout_lines_status" ON "runner_payout_lines" ("status", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_runner_payout_lines_related" ON "runner_payout_lines" ("relatedLineId", "createdAt")`,
    );
    await queryRunner.query(
      `ALTER TABLE "runner_payout_lines" ADD CONSTRAINT "FK_runner_payout_lines_runner" FOREIGN KEY ("runnerProfileId") REFERENCES "runner_profiles"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "runner_payout_lines" ADD CONSTRAINT "FK_runner_payout_lines_errand" FOREIGN KEY ("errandId") REFERENCES "errands"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "runner_payout_lines" ADD CONSTRAINT "FK_runner_payout_lines_receipt" FOREIGN KEY ("receiptEvidenceId") REFERENCES "evidence"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "runner_payout_lines" ADD CONSTRAINT "FK_runner_payout_lines_related" FOREIGN KEY ("relatedLineId") REFERENCES "runner_payout_lines"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE FUNCTION "runner_payout_lines_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN
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
       $$`,
    );
    await queryRunner.query(
      `CREATE TRIGGER "TRG_runner_payout_lines_guard" BEFORE UPDATE OR DELETE ON "runner_payout_lines" FOR EACH ROW EXECUTE FUNCTION "runner_payout_lines_guard"()`,
    );
    await queryRunner.query(
      `CREATE TRIGGER "TRG_runner_payout_lines_no_truncate" BEFORE TRUNCATE ON "runner_payout_lines" FOR EACH STATEMENT EXECUTE FUNCTION "runner_payout_lines_guard"()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER "TRG_runner_payout_lines_no_truncate" ON "runner_payout_lines"`);
    await queryRunner.query(`DROP TRIGGER "TRG_runner_payout_lines_guard" ON "runner_payout_lines"`);
    await queryRunner.query(`DROP FUNCTION "runner_payout_lines_guard"()`);
    await queryRunner.query(`DROP TABLE "runner_payout_lines"`);
    await queryRunner.query(`DROP TYPE "public"."runner_payout_review_reason_enum"`);
    await queryRunner.query(`DROP TYPE "public"."runner_payout_line_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."runner_payout_line_type_enum"`);
  }
}
