import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reviewer follow-up (round 5): `refund_payout_corrections` is append-only
 * (row 100), but the row-level UPDATE/DELETE trigger does not fire on
 * TRUNCATE. A statement-level BEFORE TRUNCATE trigger closes that gap; it
 * reuses the existing `refund_payout_corrections_append_only()` function.
 * Reversible.
 */
export class GuardRefundPayoutCorrectionsTruncate1790101300000 implements MigrationInterface {
  name = 'GuardRefundPayoutCorrectionsTruncate1790101300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TRIGGER "TRG_refund_payout_corrections_no_truncate" BEFORE TRUNCATE ON "refund_payout_corrections" FOR EACH STATEMENT EXECUTE FUNCTION "refund_payout_corrections_append_only"()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER "TRG_refund_payout_corrections_no_truncate" ON "refund_payout_corrections"`,
    );
  }
}
