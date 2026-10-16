import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Owner answer row 151 (2026-10-16): an approval of a runner item
 * reimbursement above the runner's purchase limit (row 142 exception) is
 * stored in the existing append-only `task_exposure_overrides` table.
 *
 * Schema change, kept in its own migration so the owner can see it:
 * - `source` gets a new value `purchase_limit` (the existing discriminator;
 *   no separate `scope` column, row 145 is still open);
 * - new nullable columns, required on `purchase_limit` rows:
 *   `runnerProfileId` (the runner), `assignmentId` (the runner's assignment on
 *   the task), `limitAtTime` (the runner's limit that applied, i.e. the
 *   line's stored limit, row 152), `requestedAmount` (what the line asked
 *   for). `amount` is the approved amount (`approvedAmount` in the API;
 *   `amountAbove` = amount - limitAtTime is derived), `normalCap` the ordinary approval
 *   ceiling, `note` the reason, `createdByUserId` / `createdAt` the approving
 *   admin and time; the line (`runnerPayoutLineId`) and the task
 *   (`errandId`) identify the assignment;
 * - the subject guard also checks that `runnerProfileId` is the line's runner.
 *
 * Reversible while no `purchase_limit` row exists (the table is
 * append-only, so down refuses once one was recorded).
 */
const PREVIOUS_SUBJECT_CHECK = `("source" IN ('refund_decision', 'refund_correction') AND "refundReviewId" IS NOT NULL AND "runnerPayoutLineId" IS NULL)
          OR ("source" = 'runner_reimbursement' AND "runnerPayoutLineId" IS NOT NULL AND "refundReviewId" IS NULL)`;

const PREVIOUS_GUARD = `DECLARE
         subject_errand uuid;
       BEGIN
         IF NEW."refundReviewId" IS NOT NULL THEN
           SELECT "errandId" INTO subject_errand FROM "refund_reviews" WHERE id = NEW."refundReviewId";
         ELSE
           SELECT "errandId" INTO subject_errand FROM "runner_payout_lines" WHERE id = NEW."runnerPayoutLineId";
         END IF;
         IF subject_errand IS DISTINCT FROM NEW."errandId" THEN
           RAISE EXCEPTION 'task_exposure_overrides: errandId must match its refund review or payout line';
         END IF;
         RETURN NEW;
       END;`;

const GUARD = `DECLARE
         subject_errand uuid;
         subject_runner uuid;
       BEGIN
         IF NEW."refundReviewId" IS NOT NULL THEN
           SELECT "errandId" INTO subject_errand FROM "refund_reviews" WHERE id = NEW."refundReviewId";
         ELSE
           SELECT "errandId", "runnerProfileId" INTO subject_errand, subject_runner
             FROM "runner_payout_lines" WHERE id = NEW."runnerPayoutLineId";
         END IF;
         IF subject_errand IS DISTINCT FROM NEW."errandId" THEN
           RAISE EXCEPTION 'task_exposure_overrides: errandId must match its refund review or payout line';
         END IF;
         IF NEW."runnerProfileId" IS NOT NULL AND NEW."runnerProfileId" IS DISTINCT FROM subject_runner THEN
           RAISE EXCEPTION 'task_exposure_overrides: runnerProfileId must match its payout line';
         END IF;
         IF NEW."assignmentId" IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM "errand_assignments" a
            WHERE a.id = NEW."assignmentId" AND a."errandId" = NEW."errandId"
              AND a."runnerProfileId" = subject_runner) THEN
           RAISE EXCEPTION 'task_exposure_overrides: assignmentId must be the runner''s assignment on the task';
         END IF;
         RETURN NEW;
       END;`;

export class AddPurchaseLimitOverrides1790102200000 implements MigrationInterface {
  name = 'AddPurchaseLimitOverrides1790102200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."task_exposure_override_source_enum" ADD VALUE IF NOT EXISTS 'purchase_limit'`,
    );
    await queryRunner.query(`ALTER TABLE "task_exposure_overrides" ADD "runnerProfileId" uuid`);
    await queryRunner.query(`ALTER TABLE "task_exposure_overrides" ADD "assignmentId" uuid`);
    await queryRunner.query(`ALTER TABLE "task_exposure_overrides" ADD "limitAtTime" numeric(12,2)`);
    await queryRunner.query(`ALTER TABLE "task_exposure_overrides" ADD "requestedAmount" numeric(12,2)`);
    await queryRunner.query(
      `ALTER TABLE "task_exposure_overrides" ADD CONSTRAINT "FK_task_exposure_overrides_runner" FOREIGN KEY ("runnerProfileId") REFERENCES "runner_profiles"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "task_exposure_overrides" ADD CONSTRAINT "FK_task_exposure_overrides_assignment" FOREIGN KEY ("assignmentId") REFERENCES "errand_assignments"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    // The new enum value cannot be used as an enum literal in the same
    // transaction, so the checks compare its text.
    await queryRunner.query(`ALTER TABLE "task_exposure_overrides" DROP CONSTRAINT "CHK_task_exposure_overrides_subject"`);
    await queryRunner.query(
      `ALTER TABLE "task_exposure_overrides" ADD CONSTRAINT "CHK_task_exposure_overrides_subject" CHECK (
        ("source"::text IN ('refund_decision', 'refund_correction') AND "refundReviewId" IS NOT NULL AND "runnerPayoutLineId" IS NULL)
        OR ("source"::text IN ('runner_reimbursement', 'purchase_limit') AND "runnerPayoutLineId" IS NOT NULL AND "refundReviewId" IS NULL)
      )`,
    );
    await queryRunner.query(
      `ALTER TABLE "task_exposure_overrides" ADD CONSTRAINT "CHK_task_exposure_overrides_purchase_limit" CHECK (
        "source"::text <> 'purchase_limit'
        OR ("runnerProfileId" IS NOT NULL AND "limitAtTime" IS NOT NULL AND "requestedAmount" IS NOT NULL
            AND "amount" > "limitAtTime" AND "amount" <= "requestedAmount")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_task_exposure_overrides_line" ON "task_exposure_overrides" ("runnerPayoutLineId") WHERE "runnerPayoutLineId" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE OR REPLACE FUNCTION "task_exposure_overrides_subject_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
       ${GUARD}
       $$`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE OR REPLACE FUNCTION "task_exposure_overrides_subject_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
       ${PREVIOUS_GUARD}
       $$`,
    );
    await queryRunner.query(`DROP INDEX "IDX_task_exposure_overrides_line"`);
    await queryRunner.query(`ALTER TABLE "task_exposure_overrides" DROP CONSTRAINT "CHK_task_exposure_overrides_purchase_limit"`);
    await queryRunner.query(`ALTER TABLE "task_exposure_overrides" DROP CONSTRAINT "CHK_task_exposure_overrides_subject"`);
    await queryRunner.query(`ALTER TABLE "task_exposure_overrides" DROP CONSTRAINT "FK_task_exposure_overrides_assignment"`);
    await queryRunner.query(`ALTER TABLE "task_exposure_overrides" DROP CONSTRAINT "FK_task_exposure_overrides_runner"`);
    await queryRunner.query(`ALTER TABLE "task_exposure_overrides" DROP COLUMN "requestedAmount"`);
    await queryRunner.query(`ALTER TABLE "task_exposure_overrides" DROP COLUMN "limitAtTime"`);
    await queryRunner.query(`ALTER TABLE "task_exposure_overrides" DROP COLUMN "assignmentId"`);
    await queryRunner.query(`ALTER TABLE "task_exposure_overrides" DROP COLUMN "runnerProfileId"`);
    // Drop the enum value: fails (append-only rows) if a purchase_limit row exists.
    await queryRunner.query(`ALTER TYPE "public"."task_exposure_override_source_enum" RENAME TO "task_exposure_override_source_enum_old"`);
    await queryRunner.query(
      `CREATE TYPE "public"."task_exposure_override_source_enum" AS ENUM('refund_decision', 'refund_correction', 'runner_reimbursement')`,
    );
    await queryRunner.query(
      `ALTER TABLE "task_exposure_overrides" ALTER COLUMN "source" TYPE "public"."task_exposure_override_source_enum" USING "source"::text::"public"."task_exposure_override_source_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."task_exposure_override_source_enum_old"`);
    await queryRunner.query(
      `ALTER TABLE "task_exposure_overrides" ADD CONSTRAINT "CHK_task_exposure_overrides_subject" CHECK (
          ${PREVIOUS_SUBJECT_CHECK}
        )`,
    );
  }
}
