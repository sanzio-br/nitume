import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Owner answer row 68 (2026-10-09): after quote_expired the customer can tap
 * "Request a new quote" and an admin re-quotes. No new table: one nullable
 * timestamp on `errands` records the pending request (cleared by the
 * re-quote), with a partial index for the admin queue filter. Reversible.
 */
export class AddErrandQuoteRequestedAt1790100900000 implements MigrationInterface {
  name = 'AddErrandQuoteRequestedAt1790100900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "errands" ADD "quoteRequestedAt" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(
      `CREATE INDEX "IDX_errands_quote_requested" ON "errands" ("quoteRequestedAt") WHERE "quoteRequestedAt" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_errands_quote_requested"`);
    await queryRunner.query(`ALTER TABLE "errands" DROP COLUMN "quoteRequestedAt"`);
  }
}
