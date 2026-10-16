import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reviewer minor 4 (round 9): the append-only guard of
 * `verification_document_access_log` (1790102800000) compared identity
 * columns with `=`, which is NULL-unsafe. Every comparison now uses
 * IS NOT DISTINCT FROM. Same rule as before: the only allowed UPDATE clears
 * the note of a `re_review` row whose verification is already purged.
 * Reversible (restores the 1790102800000 body).
 */
const PREVIOUS_GUARD = `BEGIN
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

const GUARD = `BEGIN
         IF TG_OP = 'UPDATE'
           AND OLD."action"::text = 're_review' AND NEW."note" IS NULL
           AND NEW."id" IS NOT DISTINCT FROM OLD."id"
           AND NEW."verificationId" IS NOT DISTINCT FROM OLD."verificationId"
           AND NEW."runnerProfileId" IS NOT DISTINCT FROM OLD."runnerProfileId"
           AND NEW."action" IS NOT DISTINCT FROM OLD."action"
           AND NEW."actorUserId" IS NOT DISTINCT FROM OLD."actorUserId"
           AND NEW."ip" IS NOT DISTINCT FROM OLD."ip"
           AND NEW."createdAt" IS NOT DISTINCT FROM OLD."createdAt"
           AND EXISTS (SELECT 1 FROM "runner_verifications" v
                        WHERE v.id = OLD."verificationId" AND v."purgedAt" IS NOT NULL) THEN
           RETURN NEW; -- Row 170: the purge clears a re-review note, nothing else.
         END IF;
         RAISE EXCEPTION 'verification_document_access_log is append-only';
       END;`;

export class HardenReReviewNoteGuard1790102900000 implements MigrationInterface {
  name = 'HardenReReviewNoteGuard1790102900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE OR REPLACE FUNCTION "verification_document_access_log_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
       ${GUARD}
       $$`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE OR REPLACE FUNCTION "verification_document_access_log_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
       ${PREVIOUS_GUARD}
       $$`,
    );
  }
}
