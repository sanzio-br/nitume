import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Owner answer row 100 (2026-10-12): an auditable, append-only record of
 * corrections and reversals of a refund payout. The review's original
 * payout receipt stays immutable. Reversible.
 */
export class AddRefundPayoutCorrections1790101200000 implements MigrationInterface {
  name = 'AddRefundPayoutCorrections1790101200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."refund_payout_correction_kind_enum" AS ENUM('correction', 'reversal')`,
    );
    await queryRunner.query(
      `CREATE TABLE "refund_payout_corrections" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "refundReviewId" uuid NOT NULL, "kind" "public"."refund_payout_correction_kind_enum" NOT NULL, "previousPayoutReference" character varying(64) NOT NULL, "newPayoutReference" character varying(64), "amount" numeric(12,2), "reason" text NOT NULL, "createdByUserId" uuid NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_refund_payout_corrections" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_refund_payout_corrections_review" ON "refund_payout_corrections" ("refundReviewId", "createdAt")`,
    );
    await queryRunner.query(
      `ALTER TABLE "refund_payout_corrections" ADD CONSTRAINT "FK_refund_payout_corrections_review" FOREIGN KEY ("refundReviewId") REFERENCES "refund_reviews"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refund_payout_corrections" DROP CONSTRAINT "FK_refund_payout_corrections_review"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_refund_payout_corrections_review"`);
    await queryRunner.query(`DROP TABLE "refund_payout_corrections"`);
    await queryRunner.query(`DROP TYPE "public"."refund_payout_correction_kind_enum"`);
  }
}
