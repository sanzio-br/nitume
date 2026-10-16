import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Owner answers rows 117, 146, 153 (RA-15, N-17): runner payout requests.
 * A runner asks for a payout up to their available amount (above a
 * configurable minimum, one open request at a time); ops pay it manually by
 * marking whole payable lines paid, or reject it with a note.
 *
 * - `runner_payout_requests`: `requestedAmount` and `paidAmount` stored
 *   separately (`paidAmount` null until paid, at most the request; a request
 *   paid below the amount still closes `paid` and the difference is not
 *   carried on it), status requested | paid | rejected, the destination
 *   phone (the runner's sign-in phone, row 118), the M-Pesa receipt, who
 *   decided and when, the decision note. One open request per runner
 *   (partial unique index). Rows are never deleted; a request only moves
 *   requested -> paid | rejected, and is final after that (trigger).
 * - `runner_payout_lines.payoutRequestId`: the request a line was paid on;
 *   set only when the line is marked paid (ledger guard).
 * Reversible.
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
             OR NEW."paidByUserId" IS DISTINCT FROM OLD."paidByUserId"
             OR NEW."payoutRequestId" IS DISTINCT FROM OLD."payoutRequestId") THEN
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

export class AddRunnerPayoutRequests1790102300000 implements MigrationInterface {
  name = 'AddRunnerPayoutRequests1790102300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."runner_payout_request_status_enum" AS ENUM('requested', 'paid', 'rejected')`,
    );
    await queryRunner.query(
      `CREATE TABLE "runner_payout_requests" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "runnerProfileId" uuid NOT NULL,
        "requestedAmount" numeric(12,2) NOT NULL,
        "paidAmount" numeric(12,2),
        "status" "public"."runner_payout_request_status_enum" NOT NULL DEFAULT 'requested',
        "destinationPhone" varchar(20) NOT NULL,
        "payoutReference" varchar(64),
        "decidedByUserId" uuid,
        "decidedAt" TIMESTAMP WITH TIME ZONE,
        "decisionNote" text,
        "createdByUserId" uuid NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_runner_payout_requests" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_runner_payout_requests_amounts" CHECK (
          "requestedAmount" > 0 AND ("paidAmount" IS NULL OR ("paidAmount" > 0 AND "paidAmount" <= "requestedAmount"))
        ),
        CONSTRAINT "CHK_runner_payout_requests_state" CHECK (
          ("status" = 'requested' AND "paidAmount" IS NULL AND "payoutReference" IS NULL AND "decidedAt" IS NULL AND "decidedByUserId" IS NULL)
          OR ("status" = 'paid' AND "paidAmount" IS NOT NULL AND "payoutReference" IS NOT NULL AND "decidedAt" IS NOT NULL AND "decidedByUserId" IS NOT NULL)
          OR ("status" = 'rejected' AND "paidAmount" IS NULL AND "payoutReference" IS NULL AND "decisionNote" IS NOT NULL AND "decidedAt" IS NOT NULL AND "decidedByUserId" IS NOT NULL)
        )
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_runner_payout_requests_runner" ON "runner_payout_requests" ("runnerProfileId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_runner_payout_requests_status" ON "runner_payout_requests" ("status", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_runner_payout_requests_one_open" ON "runner_payout_requests" ("runnerProfileId") WHERE "status" = 'requested'`,
    );
    await queryRunner.query(
      `ALTER TABLE "runner_payout_requests" ADD CONSTRAINT "FK_runner_payout_requests_runner" FOREIGN KEY ("runnerProfileId") REFERENCES "runner_profiles"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE FUNCTION "runner_payout_requests_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN
         IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
           RAISE EXCEPTION 'runner_payout_requests is append-only (no %)', TG_OP;
         END IF;
         IF OLD."status" <> 'requested' THEN
           RAISE EXCEPTION 'runner_payout_requests: a % request is final', OLD."status";
         END IF;
         IF NEW."status" NOT IN ('paid', 'rejected') THEN
           RAISE EXCEPTION 'runner_payout_requests: requested -> % is not allowed', NEW."status";
         END IF;
         IF NEW."id" IS DISTINCT FROM OLD."id"
           OR NEW."runnerProfileId" IS DISTINCT FROM OLD."runnerProfileId"
           OR NEW."requestedAmount" IS DISTINCT FROM OLD."requestedAmount"
           OR NEW."destinationPhone" IS DISTINCT FROM OLD."destinationPhone"
           OR NEW."createdByUserId" IS DISTINCT FROM OLD."createdByUserId"
           OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
           RAISE EXCEPTION 'runner_payout_requests: a request''s identity is immutable';
         END IF;
         RETURN NEW;
       END;
       $$`,
    );
    await queryRunner.query(
      `CREATE TRIGGER "TRG_runner_payout_requests_guard" BEFORE UPDATE OR DELETE ON "runner_payout_requests" FOR EACH ROW EXECUTE FUNCTION "runner_payout_requests_guard"()`,
    );
    await queryRunner.query(
      `CREATE TRIGGER "TRG_runner_payout_requests_no_truncate" BEFORE TRUNCATE ON "runner_payout_requests" FOR EACH STATEMENT EXECUTE FUNCTION "runner_payout_requests_guard"()`,
    );
    await queryRunner.query(`ALTER TABLE "runner_payout_lines" ADD "payoutRequestId" uuid`);
    await queryRunner.query(
      `ALTER TABLE "runner_payout_lines" ADD CONSTRAINT "FK_runner_payout_lines_request" FOREIGN KEY ("payoutRequestId") REFERENCES "runner_payout_requests"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_runner_payout_lines_request" ON "runner_payout_lines" ("payoutRequestId") WHERE "payoutRequestId" IS NOT NULL`,
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
    await queryRunner.query(`DROP INDEX "IDX_runner_payout_lines_request"`);
    await queryRunner.query(`ALTER TABLE "runner_payout_lines" DROP CONSTRAINT "FK_runner_payout_lines_request"`);
    await queryRunner.query(`ALTER TABLE "runner_payout_lines" DROP COLUMN "payoutRequestId"`);
    await queryRunner.query(`DROP TABLE "runner_payout_requests"`);
    await queryRunner.query(`DROP FUNCTION "runner_payout_requests_guard"()`);
    await queryRunner.query(`DROP TYPE "public"."runner_payout_request_status_enum"`);
  }
}
