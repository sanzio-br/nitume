import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Owner answer row 108 (2026-10-13): "a runner may decline a task when the
 * required purchase exceeds their configured limit." Records why an
 * assignment was declined; the only value today is `over_purchase_limit`.
 * Nullable, no backfill. Reversible.
 */
export class AddAssignmentDeclineReason1790101500000 implements MigrationInterface {
  name = 'AddAssignmentDeclineReason1790101500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."errand_assignment_decline_reason_enum" AS ENUM('over_purchase_limit')`,
    );
    await queryRunner.query(
      `ALTER TABLE "errand_assignments" ADD "declineReason" "public"."errand_assignment_decline_reason_enum"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "errand_assignments" DROP COLUMN "declineReason"`);
    await queryRunner.query(`DROP TYPE "public"."errand_assignment_decline_reason_enum"`);
  }
}
