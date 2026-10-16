import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Row 171 (owner, 2026-10-16) with the round-10 admin spec: the audited
 * "Re-review evidence" may carry an optional note (<= 500 characters; whether
 * a reason is required is open, BOARD row 180). Row 170: the purge deletes
 * the reviewer's note, so it deletes re-review notes too.
 *
 * - `verification_document_access_log.note`: only on `re_review` rows.
 * - The append-only guard allows exactly one update: clearing the note of a
 *   `re_review` row whose verification is already purged (same transaction
 *   as the purge). Every other UPDATE, DELETE and TRUNCATE is still refused.
 * Reversible (drops the column, restores the strict guard).
 */
const STRICT_GUARD = `BEGIN
         RAISE EXCEPTION 'verification_document_access_log is append-only';
       END;`;

const PURGE_AWARE_GUARD = `BEGIN
         IF TG_OP = 'UPDATE'
           AND OLD."action"::text = 're_review' AND NEW."note" IS NULL
           AND NEW."id" = OLD."id" AND NEW."verificationId" = OLD."verificationId"
           AND NEW."runnerProfileId" = OLD."runnerProfileId" AND NEW."action" = OLD."action"
           AND NEW."actorUserId" IS NOT DISTINCT FROM OLD."actorUserId"
           AND NEW."ip" IS NOT DISTINCT FROM OLD."ip" AND NEW."createdAt" = OLD."createdAt"
           AND EXISTS (SELECT 1 FROM "runner_verifications" v
                        WHERE v.id = OLD."verificationId" AND v."purgedAt" IS NOT NULL) THEN
           RETURN NEW; -- Row 170: the purge clears a re-review note, nothing else.
         END IF;
         RAISE EXCEPTION 'verification_document_access_log is append-only';
       END;`;

export class AddReReviewNote1790102800000 implements MigrationInterface {
  name = 'AddReReviewNote1790102800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "verification_document_access_log" ADD "note" text`);
    await queryRunner.query(
      `ALTER TABLE "verification_document_access_log" ADD CONSTRAINT "CHK_verification_document_access_log_note" CHECK (
        "note" IS NULL OR ("action"::text = 're_review' AND char_length("note") BETWEEN 1 AND 500)
      )`,
    );
    await queryRunner.query(
      `CREATE OR REPLACE FUNCTION "verification_document_access_log_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
       ${PURGE_AWARE_GUARD}
       $$`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE OR REPLACE FUNCTION "verification_document_access_log_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
       ${STRICT_GUARD}
       $$`,
    );
    await queryRunner.query(
      `ALTER TABLE "verification_document_access_log" DROP CONSTRAINT "CHK_verification_document_access_log_note"`,
    );
    await queryRunner.query(`ALTER TABLE "verification_document_access_log" DROP COLUMN "note"`);
  }
}
