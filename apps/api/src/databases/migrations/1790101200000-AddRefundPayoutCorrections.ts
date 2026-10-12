import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Owner answer row 100 (2026-10-12), system design §2.2: an auditable,
 * append-only record of corrections, reversals and re-sent payouts of a
 * refund. The review's original payout receipt stays immutable. A trigger
 * rejects UPDATE and DELETE on the table (append-only at the DB level).
 * Reversible.
 */
export class AddRefundPayoutCorrections1790101200000 implements MigrationInterface {
  name = 'AddRefundPayoutCorrections1790101200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."refund_payout_correction_kind_enum" AS ENUM('corrected', 'reversed', 'resent')`,
    );
    await queryRunner.query(
      `CREATE TABLE "refund_payout_corrections" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "refundReviewId" uuid NOT NULL, "kind" "public"."refund_payout_correction_kind_enum" NOT NULL, "previousReference" character varying(64), "previousAmount" numeric(12,2) NOT NULL, "newReference" character varying(64), "newAmount" numeric(12,2), "reason" text NOT NULL, "createdByUserId" uuid NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_refund_payout_corrections" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_refund_payout_corrections_review" ON "refund_payout_corrections" ("refundReviewId", "createdAt")`,
    );
    await queryRunner.query(
      `ALTER TABLE "refund_payout_corrections" ADD CONSTRAINT "FK_refund_payout_corrections_review" FOREIGN KEY ("refundReviewId") REFERENCES "refund_reviews"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE FUNCTION "refund_payout_corrections_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN
         RAISE EXCEPTION 'refund_payout_corrections is append-only';
       END;
       $$`,
    );
    await queryRunner.query(
      `CREATE TRIGGER "TRG_refund_payout_corrections_append_only" BEFORE UPDATE OR DELETE ON "refund_payout_corrections" FOR EACH ROW EXECUTE FUNCTION "refund_payout_corrections_append_only"()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER "TRG_refund_payout_corrections_append_only" ON "refund_payout_corrections"`,
    );
    await queryRunner.query(`DROP FUNCTION "refund_payout_corrections_append_only"()`);
    await queryRunner.query(
      `ALTER TABLE "refund_payout_corrections" DROP CONSTRAINT "FK_refund_payout_corrections_review"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_refund_payout_corrections_review"`);
    await queryRunner.query(`DROP TABLE "refund_payout_corrections"`);
    await queryRunner.query(`DROP TYPE "public"."refund_payout_correction_kind_enum"`);
  }
}
