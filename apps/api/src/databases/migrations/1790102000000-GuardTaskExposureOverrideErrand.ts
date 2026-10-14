import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Re-review minor: a task exposure override must be recorded on the same
 * errand as the refund review or runner payout line it allows. BEFORE INSERT
 * trigger; the table itself is unchanged (row 145 still with the owner).
 * Reversible.
 */
export class GuardTaskExposureOverrideErrand1790102000000 implements MigrationInterface {
  name = 'GuardTaskExposureOverrideErrand1790102000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE FUNCTION "task_exposure_overrides_subject_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
       DECLARE
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
       END;
       $$`,
    );
    await queryRunner.query(
      `CREATE TRIGGER "TRG_task_exposure_overrides_subject_guard" BEFORE INSERT ON "task_exposure_overrides" FOR EACH ROW EXECUTE FUNCTION "task_exposure_overrides_subject_guard"()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER "TRG_task_exposure_overrides_subject_guard" ON "task_exposure_overrides"`,
    );
    await queryRunner.query(`DROP FUNCTION "task_exposure_overrides_subject_guard"()`);
  }
}
