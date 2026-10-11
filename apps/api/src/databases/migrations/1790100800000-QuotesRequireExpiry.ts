import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Owner answer row 83 (2026-10-09): every quote expires, 24h by default.
 * Data fix only (spec N-11), no schema change: legacy quotes with a null
 * expiry are backfilled to createdAt + 24h, as if the rule had applied when
 * they were issued, so they can be replaced by an admin re-quote.
 *
 * Effect on live tasks: an old QUOTED (or ACCEPTED, not yet paid) task now
 * reads quote_expired; the customer can request a new quote (row 68) and an
 * admin re-quotes. A stale price is never paid silently. Tasks past payment
 * never read the quote expiry again, so they are unaffected. A payment
 * already in flight blocks the re-quote (payment_in_progress) as before.
 *
 * Down restores null on the backfilled rows: those whose expiry is exactly
 * createdAt + 24h. Quotes written by the API take their expiry from the
 * application clock and createdAt from the database clock, so they do not
 * match that to the microsecond.
 */
export class QuotesRequireExpiry1790100800000 implements MigrationInterface {
  name = 'QuotesRequireExpiry1790100800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "quotes" SET "expiresAt" = "createdAt" + interval '24 hours'
        WHERE "expiresAt" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "quotes" SET "expiresAt" = NULL
        WHERE "expiresAt" = "createdAt" + interval '24 hours'`,
    );
  }
}
