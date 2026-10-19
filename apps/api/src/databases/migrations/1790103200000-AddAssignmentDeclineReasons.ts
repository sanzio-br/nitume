import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Owner answer row 210 (2026-10-19): "add full enum over_purchase_limit,
 * too_far, not_available, other (schema change approved); UI gets an
 * explicit reason picker." Adds three values to
 * `errand_assignment_decline_reason_enum`; existing rows are unchanged.
 *
 * Down recreates the one-value type. Declines that used a new value lose
 * their reason (set to null, the same as a decline without one); the
 * decline itself stays. errand_assignments has no guard trigger.
 */
export class AddAssignmentDeclineReasons1790103200000 implements MigrationInterface {
  name = 'AddAssignmentDeclineReasons1790103200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "public"."errand_assignment_decline_reason_enum" ADD VALUE IF NOT EXISTS 'too_far'`);
    await queryRunner.query(`ALTER TYPE "public"."errand_assignment_decline_reason_enum" ADD VALUE IF NOT EXISTS 'not_available'`);
    await queryRunner.query(`ALTER TYPE "public"."errand_assignment_decline_reason_enum" ADD VALUE IF NOT EXISTS 'other'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "errand_assignments" SET "declineReason" = NULL
        WHERE "declineReason"::text IN ('too_far', 'not_available', 'other')`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."errand_assignment_decline_reason_enum" RENAME TO "errand_assignment_decline_reason_enum_old"`,
    );
    await queryRunner.query(`CREATE TYPE "public"."errand_assignment_decline_reason_enum" AS ENUM('over_purchase_limit')`);
    await queryRunner.query(
      `ALTER TABLE "errand_assignments" ALTER COLUMN "declineReason" TYPE "public"."errand_assignment_decline_reason_enum"
        USING "declineReason"::text::"public"."errand_assignment_decline_reason_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."errand_assignment_decline_reason_enum_old"`);
  }
}
