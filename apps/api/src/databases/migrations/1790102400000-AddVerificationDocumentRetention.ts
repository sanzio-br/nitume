import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Owner answers rows 125, 144, 154 (RA-7): runner ID and selfie images in
 * restricted storage, kept only for a configurable retention period, then
 * securely deleted; access restricted and logged.
 *
 * - `runner_verifications.purgedAt`: when the daily purge deleted the stored
 *   image (its key is nulled at the same time; the verification decision
 *   itself is kept for audit).
 * - `verification_document_access_log`: append-only log of every upload,
 *   admin view (signed URL issued) and purge: verification, runner, actor
 *   (null for the system purge), action, client IP, time. Triggers reject
 *   UPDATE, DELETE and TRUNCATE.
 * Reversible.
 */
export class AddVerificationDocumentRetention1790102400000 implements MigrationInterface {
  name = 'AddVerificationDocumentRetention1790102400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "runner_verifications" ADD "purgedAt" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(
      `ALTER TABLE "runner_verifications" ADD CONSTRAINT "CHK_runner_verifications_purged" CHECK ("purgedAt" IS NULL OR "documentS3Key" IS NULL)`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."verification_document_access_action_enum" AS ENUM('upload', 'view', 'purge')`,
    );
    await queryRunner.query(
      `CREATE TABLE "verification_document_access_log" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "verificationId" uuid NOT NULL,
        "runnerProfileId" uuid NOT NULL,
        "actorUserId" uuid,
        "action" "public"."verification_document_access_action_enum" NOT NULL,
        "ip" varchar(64),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_verification_document_access_log" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_verification_document_access_log_actor" CHECK ("action" = 'purge' OR "actorUserId" IS NOT NULL)
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_verification_document_access_log_verification" ON "verification_document_access_log" ("verificationId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_verification_document_access_log_actor" ON "verification_document_access_log" ("actorUserId", "createdAt")`,
    );
    await queryRunner.query(
      `ALTER TABLE "verification_document_access_log" ADD CONSTRAINT "FK_verification_document_access_log_verification" FOREIGN KEY ("verificationId") REFERENCES "runner_verifications"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE FUNCTION "verification_document_access_log_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN
         RAISE EXCEPTION 'verification_document_access_log is append-only';
       END;
       $$`,
    );
    await queryRunner.query(
      `CREATE TRIGGER "TRG_verification_document_access_log_append_only" BEFORE UPDATE OR DELETE ON "verification_document_access_log" FOR EACH ROW EXECUTE FUNCTION "verification_document_access_log_append_only"()`,
    );
    await queryRunner.query(
      `CREATE TRIGGER "TRG_verification_document_access_log_no_truncate" BEFORE TRUNCATE ON "verification_document_access_log" FOR EACH STATEMENT EXECUTE FUNCTION "verification_document_access_log_append_only"()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "verification_document_access_log"`);
    await queryRunner.query(`DROP FUNCTION "verification_document_access_log_append_only"()`);
    await queryRunner.query(`DROP TYPE "public"."verification_document_access_action_enum"`);
    await queryRunner.query(`ALTER TABLE "runner_verifications" DROP CONSTRAINT "CHK_runner_verifications_purged"`);
    await queryRunner.query(`ALTER TABLE "runner_verifications" DROP COLUMN "purgedAt"`);
  }
}
