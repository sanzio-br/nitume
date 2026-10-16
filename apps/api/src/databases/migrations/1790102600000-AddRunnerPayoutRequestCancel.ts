import { MigrationInterface, QueryRunner } from 'typeorm';
import { REQUEST_GUARD_165 } from './1790102500000-GuardRunnerPayoutRequestAudit';

/**
 * Owner answer row 166 (2026-10-16): ops-only cancel of an open payout
 * request with a mandatory free-text reason. PENDING (stored `requested`)
 * -> PAID | REJECTED | CANCELLED; all three are final, no reopening;
 * `requestedAmount` unchanged.
 *
 * - enum value `cancelled` on `runner_payout_request_status_enum`;
 * - `cancelledByUserId`, `cancelledAt`, `cancellationReason` (all set
 *   together, only on a cancelled request; the decision columns stay null);
 * - the state check and the update guard allow requested -> cancelled and
 *   let the cancel columns change only on that step. The lines are never
 *   linked to an open request, so nothing on `runner_payout_lines` changes.
 *
 * The new enum value cannot be used as an enum literal in the same
 * transaction, so the check compares the status text. Reversible while no
 * request is cancelled (cancelled rows cannot be deleted: append-only).
 */
const STATE_CHECK_166 = `
  ("status"::text = 'requested' AND "paidAmount" IS NULL AND "payoutReference" IS NULL AND "decidedAt" IS NULL AND "decidedByUserId" IS NULL
     AND "cancelledAt" IS NULL AND "cancelledByUserId" IS NULL AND "cancellationReason" IS NULL)
  OR ("status"::text = 'paid' AND "paidAmount" IS NOT NULL AND "payoutReference" IS NOT NULL AND "decidedAt" IS NOT NULL AND "decidedByUserId" IS NOT NULL
     AND "cancelledAt" IS NULL AND "cancelledByUserId" IS NULL AND "cancellationReason" IS NULL)
  OR ("status"::text = 'rejected' AND "paidAmount" IS NULL AND "payoutReference" IS NULL AND "decisionNote" IS NOT NULL AND "decidedAt" IS NOT NULL AND "decidedByUserId" IS NOT NULL
     AND "cancelledAt" IS NULL AND "cancelledByUserId" IS NULL AND "cancellationReason" IS NULL)
  OR ("status"::text = 'cancelled' AND "paidAmount" IS NULL AND "payoutReference" IS NULL AND "decidedAt" IS NULL AND "decidedByUserId" IS NULL
     AND "cancelledAt" IS NOT NULL AND "cancelledByUserId" IS NOT NULL AND "cancellationReason" IS NOT NULL)`;

const PREVIOUS_STATE_CHECK = `
  ("status" = 'requested' AND "paidAmount" IS NULL AND "payoutReference" IS NULL AND "decidedAt" IS NULL AND "decidedByUserId" IS NULL)
  OR ("status" = 'paid' AND "paidAmount" IS NOT NULL AND "payoutReference" IS NOT NULL AND "decidedAt" IS NOT NULL AND "decidedByUserId" IS NOT NULL)
  OR ("status" = 'rejected' AND "paidAmount" IS NULL AND "payoutReference" IS NULL AND "decisionNote" IS NOT NULL AND "decidedAt" IS NOT NULL AND "decidedByUserId" IS NOT NULL)`;

const REQUEST_GUARD_166 = `BEGIN
         IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
           RAISE EXCEPTION 'runner_payout_requests is append-only (no %)', TG_OP;
         END IF;
         IF OLD."status"::text <> 'requested' THEN
           RAISE EXCEPTION 'runner_payout_requests: a % request is final', OLD."status";
         END IF;
         IF NEW."status"::text NOT IN ('paid', 'rejected', 'cancelled') THEN
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
         IF NEW."status"::text = 'cancelled' AND (
             NEW."paidAmount" IS DISTINCT FROM OLD."paidAmount"
             OR NEW."payoutReference" IS DISTINCT FROM OLD."payoutReference"
             OR NEW."decidedByUserId" IS DISTINCT FROM OLD."decidedByUserId"
             OR NEW."decidedAt" IS DISTINCT FROM OLD."decidedAt"
             OR NEW."decisionNote" IS DISTINCT FROM OLD."decisionNote") THEN
           RAISE EXCEPTION 'runner_payout_requests: a cancel records only the cancel fields';
         END IF;
         IF NEW."status"::text <> 'cancelled' AND (
             NEW."cancelledByUserId" IS NOT NULL OR NEW."cancelledAt" IS NOT NULL OR NEW."cancellationReason" IS NOT NULL) THEN
           RAISE EXCEPTION 'runner_payout_requests: cancel fields are set only by a cancel';
         END IF;
         NEW."updatedAt" := now();
         RETURN NEW;
       END;`;

export class AddRunnerPayoutRequestCancel1790102600000 implements MigrationInterface {
  name = 'AddRunnerPayoutRequestCancel1790102600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."runner_payout_request_status_enum" ADD VALUE IF NOT EXISTS 'cancelled'`,
    );
    await queryRunner.query(`ALTER TABLE "runner_payout_requests" ADD "cancelledByUserId" uuid`);
    await queryRunner.query(`ALTER TABLE "runner_payout_requests" ADD "cancelledAt" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "runner_payout_requests" ADD "cancellationReason" text`);
    await queryRunner.query(`ALTER TABLE "runner_payout_requests" DROP CONSTRAINT "CHK_runner_payout_requests_state"`);
    await queryRunner.query(
      `ALTER TABLE "runner_payout_requests" ADD CONSTRAINT "CHK_runner_payout_requests_state" CHECK (${STATE_CHECK_166})`,
    );
    await queryRunner.query(
      `CREATE OR REPLACE FUNCTION "runner_payout_requests_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
       ${REQUEST_GUARD_166}
       $$`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE OR REPLACE FUNCTION "runner_payout_requests_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
       ${REQUEST_GUARD_165}
       $$`,
    );
    await queryRunner.query(`ALTER TABLE "runner_payout_requests" DROP CONSTRAINT "CHK_runner_payout_requests_state"`);
    await queryRunner.query(`ALTER TABLE "runner_payout_requests" DROP COLUMN "cancellationReason"`);
    await queryRunner.query(`ALTER TABLE "runner_payout_requests" DROP COLUMN "cancelledAt"`);
    await queryRunner.query(`ALTER TABLE "runner_payout_requests" DROP COLUMN "cancelledByUserId"`);
    // Drop the enum value: fails if a cancelled request exists (rows are append-only).
    await queryRunner.query(`DROP INDEX "IDX_runner_payout_requests_one_open"`);
    await queryRunner.query(`DROP INDEX "IDX_runner_payout_requests_status"`);
    await queryRunner.query(
      `ALTER TABLE "runner_payout_requests" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."runner_payout_request_status_enum" RENAME TO "runner_payout_request_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."runner_payout_request_status_enum" AS ENUM('requested', 'paid', 'rejected')`,
    );
    await queryRunner.query(
      `ALTER TABLE "runner_payout_requests" ALTER COLUMN "status" TYPE "public"."runner_payout_request_status_enum" USING "status"::text::"public"."runner_payout_request_status_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."runner_payout_request_status_enum_old"`);
    await queryRunner.query(`ALTER TABLE "runner_payout_requests" ALTER COLUMN "status" SET DEFAULT 'requested'`);
    await queryRunner.query(
      `CREATE INDEX "IDX_runner_payout_requests_status" ON "runner_payout_requests" ("status", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_runner_payout_requests_one_open" ON "runner_payout_requests" ("runnerProfileId") WHERE "status" = 'requested'`,
    );
    await queryRunner.query(
      `ALTER TABLE "runner_payout_requests" ADD CONSTRAINT "CHK_runner_payout_requests_state" CHECK (${PREVIOUS_STATE_CHECK})`,
    );
  }
}
