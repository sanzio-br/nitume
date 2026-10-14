import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Re-review fix (round 6): an item reimbursement created at CONFIRMED while a
 * price-decrease refund review is still undecided goes on hold with reason
 * `price_decrease_pending`, so the runner is never made payable for an item
 * amount the customer may be refunded.
 *
 * Down is a no-op: Postgres cannot drop a value from an enum type (same as
 * AddRefundTriggerExpiredFailedAfterPayment1790101100000). The unused value
 * is harmless to the previous code.
 */
export class AddPriceDecreasePendingReviewReason1790101900000 implements MigrationInterface {
  name = 'AddPriceDecreasePendingReviewReason1790101900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."runner_payout_review_reason_enum" ADD VALUE IF NOT EXISTS 'price_decrease_pending'`,
    );
  }

  public async down(): Promise<void> {
    // Intentionally empty: Postgres cannot drop enum values (see above).
  }
}
