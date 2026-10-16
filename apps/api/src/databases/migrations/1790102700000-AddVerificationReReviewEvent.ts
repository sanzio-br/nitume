import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Owner answers rows 161 (d) and 171 (2026-10-16): an explicit, audited admin
 * "Re-review evidence" action on an already-decided ID/selfie verification
 * restarts the 12-month retention clock. It is recorded as a new action
 * `re_review` in the existing append-only `verification_document_access_log`
 * (admin, time, verification, IP, event id). Views (`view`) never restart
 * the clock.
 *
 * Down: recreates the enum without `re_review`; fails if such a row exists
 * (the log is append-only).
 */
export class AddVerificationReReviewEvent1790102700000 implements MigrationInterface {
  name = 'AddVerificationReReviewEvent1790102700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."verification_document_access_action_enum" ADD VALUE IF NOT EXISTS 're_review'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "verification_document_access_log" DROP CONSTRAINT "CHK_verification_document_access_log_actor"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."verification_document_access_action_enum" RENAME TO "verification_document_access_action_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."verification_document_access_action_enum" AS ENUM('upload', 'view', 'purge')`,
    );
    await queryRunner.query(
      `ALTER TABLE "verification_document_access_log" ALTER COLUMN "action" TYPE "public"."verification_document_access_action_enum" USING "action"::text::"public"."verification_document_access_action_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."verification_document_access_action_enum_old"`);
    await queryRunner.query(
      `ALTER TABLE "verification_document_access_log" ADD CONSTRAINT "CHK_verification_document_access_log_actor" CHECK ("action" = 'purge' OR "actorUserId" IS NOT NULL)`,
    );
  }
}
