import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Owner decisions (BOARD rows 9, 37): admin refund reviews for tasks
 * cancelled after payment, and price-difference payment records linked to
 * the approved price-change request.
 */
export class AddRefundReviewsAndPriceChangePayments1790100300000 implements MigrationInterface {
  name = 'AddRefundReviewsAndPriceChangePayments1790100300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."refund_trigger_enum" AS ENUM('price_change_rejected', 'dispute_customer_favourable', 'cancelled_after_payment')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."refund_status_enum" AS ENUM('pending_review', 'approved', 'no_refund', 'refunded')`,
    );
    await queryRunner.query(
      `CREATE TABLE "refund_reviews" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "errandId" uuid NOT NULL, "trigger" "public"."refund_trigger_enum" NOT NULL, "amountPaid" numeric(12,2) NOT NULL, "refundAmount" numeric(12,2), "status" "public"."refund_status_enum" NOT NULL DEFAULT 'pending_review', "decisionNote" text, "decidedByUserId" uuid, "decidedAt" TIMESTAMP WITH TIME ZONE, "payoutReference" character varying(64), "paidByUserId" uuid, "paidAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_refund_reviews" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_refund_reviews_errand" ON "refund_reviews" ("errandId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_refund_reviews_status" ON "refund_reviews" ("status")`,
    );
    await queryRunner.query(
      `ALTER TABLE "refund_reviews" ADD CONSTRAINT "FK_refund_reviews_errand" FOREIGN KEY ("errandId") REFERENCES "errands"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(`ALTER TABLE "payments" ADD "priceChangeRequestId" uuid`);
    await queryRunner.query(
      `CREATE INDEX "IDX_payments_price_change_request" ON "payments" ("priceChangeRequestId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "FK_payments_price_change_request" FOREIGN KEY ("priceChangeRequestId") REFERENCES "price_change_requests"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_payments_price_change_request"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_payments_price_change_request"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "priceChangeRequestId"`);
    await queryRunner.query(`ALTER TABLE "refund_reviews" DROP CONSTRAINT "FK_refund_reviews_errand"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_refund_reviews_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_refund_reviews_errand"`);
    await queryRunner.query(`DROP TABLE "refund_reviews"`);
    await queryRunner.query(`DROP TYPE "public"."refund_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."refund_trigger_enum"`);
  }
}
