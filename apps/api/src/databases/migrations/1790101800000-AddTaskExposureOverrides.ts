import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Owner answer row 136: on a task, customer refunds and the runner's item
 * reimbursement share one combined cap; "exceptional cases above the normal
 * cap require ops review and explicit handling". Each admin override of that
 * cap is recorded here: who, when, the amount, the normal cap at the time,
 * the figures it was computed from, and the required note. Append-only:
 * triggers reject UPDATE, DELETE and TRUNCATE. Reversible.
 */
export class AddTaskExposureOverrides1790101800000 implements MigrationInterface {
  name = 'AddTaskExposureOverrides1790101800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."task_exposure_override_source_enum" AS ENUM('refund_decision', 'refund_correction', 'runner_reimbursement')`,
    );
    await queryRunner.query(
      `CREATE TABLE "task_exposure_overrides" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "errandId" uuid NOT NULL,
        "source" "public"."task_exposure_override_source_enum" NOT NULL,
        "refundReviewId" uuid,
        "runnerPayoutLineId" uuid,
        "amount" numeric(12,2) NOT NULL,
        "normalCap" numeric(12,2) NOT NULL,
        "totalPaidToNitume" numeric(12,2) NOT NULL,
        "committedRefunds" numeric(12,2) NOT NULL,
        "committedReimbursements" numeric(12,2) NOT NULL,
        "note" text NOT NULL,
        "createdByUserId" uuid NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_task_exposure_overrides" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_task_exposure_overrides_subject" CHECK (
          ("source" IN ('refund_decision', 'refund_correction') AND "refundReviewId" IS NOT NULL AND "runnerPayoutLineId" IS NULL)
          OR ("source" = 'runner_reimbursement' AND "runnerPayoutLineId" IS NOT NULL AND "refundReviewId" IS NULL)
        ),
        CONSTRAINT "CHK_task_exposure_overrides_above_cap" CHECK ("amount" > "normalCap" AND "normalCap" >= 0)
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_task_exposure_overrides_errand" ON "task_exposure_overrides" ("errandId", "createdAt")`,
    );
    await queryRunner.query(
      `ALTER TABLE "task_exposure_overrides" ADD CONSTRAINT "FK_task_exposure_overrides_errand" FOREIGN KEY ("errandId") REFERENCES "errands"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "task_exposure_overrides" ADD CONSTRAINT "FK_task_exposure_overrides_refund" FOREIGN KEY ("refundReviewId") REFERENCES "refund_reviews"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "task_exposure_overrides" ADD CONSTRAINT "FK_task_exposure_overrides_line" FOREIGN KEY ("runnerPayoutLineId") REFERENCES "runner_payout_lines"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE FUNCTION "task_exposure_overrides_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN
         RAISE EXCEPTION 'task_exposure_overrides is append-only';
       END;
       $$`,
    );
    await queryRunner.query(
      `CREATE TRIGGER "TRG_task_exposure_overrides_append_only" BEFORE UPDATE OR DELETE ON "task_exposure_overrides" FOR EACH ROW EXECUTE FUNCTION "task_exposure_overrides_append_only"()`,
    );
    await queryRunner.query(
      `CREATE TRIGGER "TRG_task_exposure_overrides_no_truncate" BEFORE TRUNCATE ON "task_exposure_overrides" FOR EACH STATEMENT EXECUTE FUNCTION "task_exposure_overrides_append_only"()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER "TRG_task_exposure_overrides_no_truncate" ON "task_exposure_overrides"`);
    await queryRunner.query(`DROP TRIGGER "TRG_task_exposure_overrides_append_only" ON "task_exposure_overrides"`);
    await queryRunner.query(`DROP FUNCTION "task_exposure_overrides_append_only"()`);
    await queryRunner.query(`DROP TABLE "task_exposure_overrides"`);
    await queryRunner.query(`DROP TYPE "public"."task_exposure_override_source_enum"`);
  }
}
