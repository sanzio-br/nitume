import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Owner answer row 71 (2026-10-08): more than one refund review per task.
 * Every approved price DECREASE opens its own review (trigger
 * `price_change_decrease`, linked to the price-change request); a task still
 * has at most one cancellation review (priceChangeRequestId null).
 */
export class RefundReviewsPerPriceDecrease1790100700000 implements MigrationInterface {
  name = 'RefundReviewsPerPriceDecrease1790100700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."refund_trigger_enum" ADD VALUE IF NOT EXISTS 'price_change_decrease'`,
    );
    await queryRunner.query(`ALTER TABLE "refund_reviews" ADD "priceChangeRequestId" uuid`);
    await queryRunner.query(
      `ALTER TABLE "refund_reviews" ADD CONSTRAINT "FK_refund_reviews_price_change_request" FOREIGN KEY ("priceChangeRequestId") REFERENCES "price_change_requests"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_refund_reviews_errand"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_refund_reviews_errand_id" ON "refund_reviews" ("errandId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_refund_reviews_errand_cancellation" ON "refund_reviews" ("errandId") WHERE "priceChangeRequestId" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_refund_reviews_price_change" ON "refund_reviews" ("priceChangeRequestId") WHERE "priceChangeRequestId" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Decrease reviews cannot fit the one-review-per-task index; they go.
    await queryRunner.query(`DELETE FROM "refund_reviews" WHERE "priceChangeRequestId" IS NOT NULL`);
    await queryRunner.query(`DROP INDEX "public"."IDX_refund_reviews_price_change"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_refund_reviews_errand_cancellation"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_refund_reviews_errand_id"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_refund_reviews_errand" ON "refund_reviews" ("errandId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "refund_reviews" DROP CONSTRAINT "FK_refund_reviews_price_change_request"`,
    );
    await queryRunner.query(`ALTER TABLE "refund_reviews" DROP COLUMN "priceChangeRequestId"`);
    // Postgres cannot drop an enum value; 'price_change_decrease' stays unused.
  }
}
