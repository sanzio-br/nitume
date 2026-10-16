import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Owner answer row 165 (2026-10-16): on `runner_payout_requests`,
 * `createdByUserId` is the authenticated runner who submitted the request
 * (server-side, never from the client) and immutable; `updatedAt` is the time
 * of the most recent change; `requestedAmount` is immutable.
 *
 * - INSERT guard: `createdByUserId` must be the user of the request's
 *   `runnerProfileId`, so no other user (an admin, or a forged body) can be
 *   recorded as the submitter.
 * - UPDATE guard: unchanged rules (only requested -> paid | rejected, the
 *   identity incl. `createdByUserId` and `requestedAmount` immutable), and
 *   `updatedAt` is set by the database on every update, i.e. every status
 *   transition, whatever the client sends.
 * Reversible (restores the round-8 guard, drops the insert trigger).
 */
export const PREVIOUS_REQUEST_GUARD = `BEGIN
         IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
           RAISE EXCEPTION 'runner_payout_requests is append-only (no %)', TG_OP;
         END IF;
         IF OLD."status" <> 'requested' THEN
           RAISE EXCEPTION 'runner_payout_requests: a % request is final', OLD."status";
         END IF;
         IF NEW."status" NOT IN ('paid', 'rejected') THEN
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
         RETURN NEW;
       END;`;

export const REQUEST_GUARD_165 = `BEGIN
         IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
           RAISE EXCEPTION 'runner_payout_requests is append-only (no %)', TG_OP;
         END IF;
         IF OLD."status" <> 'requested' THEN
           RAISE EXCEPTION 'runner_payout_requests: a % request is final', OLD."status";
         END IF;
         IF NEW."status" NOT IN ('paid', 'rejected') THEN
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
         NEW."updatedAt" := now();
         RETURN NEW;
       END;`;

export class GuardRunnerPayoutRequestAudit1790102500000 implements MigrationInterface {
  name = 'GuardRunnerPayoutRequestAudit1790102500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE OR REPLACE FUNCTION "runner_payout_requests_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
       ${REQUEST_GUARD_165}
       $$`,
    );
    await queryRunner.query(
      `CREATE FUNCTION "runner_payout_requests_creator_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM "runner_profiles" rp
            WHERE rp.id = NEW."runnerProfileId" AND rp."userId" = NEW."createdByUserId") THEN
           RAISE EXCEPTION 'runner_payout_requests: createdByUserId must be the requesting runner';
         END IF;
         NEW."updatedAt" := NEW."createdAt";
         RETURN NEW;
       END;
       $$`,
    );
    await queryRunner.query(
      `CREATE TRIGGER "TRG_runner_payout_requests_creator" BEFORE INSERT ON "runner_payout_requests" FOR EACH ROW EXECUTE FUNCTION "runner_payout_requests_creator_guard"()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER "TRG_runner_payout_requests_creator" ON "runner_payout_requests"`);
    await queryRunner.query(`DROP FUNCTION "runner_payout_requests_creator_guard"()`);
    await queryRunner.query(
      `CREATE OR REPLACE FUNCTION "runner_payout_requests_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
       ${PREVIOUS_REQUEST_GUARD}
       $$`,
    );
  }
}
