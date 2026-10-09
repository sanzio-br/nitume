import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Owner answer row 83 (2026-10-09): every quote expires, 24h by default.
 *
 * Existing quotes with a null expiry:
 * - NOT accepted: backfilled to createdAt + 24h, as if the rule had applied
 *   when they were issued. Older ones are therefore already expired; the
 *   customer sees quote_expired and can request a new quote (row 68), and
 *   the admin can re-quote. A stale price is never accepted silently.
 * - Accepted: left null. The customer already agreed to that price; giving
 *   it an expiry now could make an ACCEPTED-but-unpaid task unpayable
 *   (quote_expired) without the customer doing anything. Errands past
 *   payment never read the quote expiry again.
 *
 * A CHECK constraint keeps the rule in the database: a quote without an
 * expiry must be an accepted (legacy) one. New quotes always get one from
 * the API.
 *
 * Down drops the constraint and restores null on the backfilled rows: those
 * whose expiry is exactly createdAt + 24h. Quotes written by the API get
 * their expiry from the application clock and createdAt from the database
 * clock, so they never match that to the microsecond.
 */
export class QuotesRequireExpiry1790100800000 implements MigrationInterface {
  name = 'QuotesRequireExpiry1790100800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "quotes" SET "expiresAt" = "createdAt" + interval '24 hours'
        WHERE "expiresAt" IS NULL AND "acceptedAt" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "quotes" ADD CONSTRAINT "CHK_quotes_expiry_required"
         CHECK ("expiresAt" IS NOT NULL OR "acceptedAt" IS NOT NULL)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "quotes" DROP CONSTRAINT "CHK_quotes_expiry_required"`);
    await queryRunner.query(
      `UPDATE "quotes" SET "expiresAt" = NULL
        WHERE "expiresAt" = "createdAt" + interval '24 hours'`,
    );
  }
}
