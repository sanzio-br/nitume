import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Owner answer row 102 (2026-10-12): a paid task ending EXPIRED or FAILED
 * opens a refund review like CANCELLED does. Adds two values to
 * `refund_trigger_enum`.
 *
 * Down is a no-op: Postgres cannot drop a value from an enum type. Removing
 * them would mean recreating the type and rewriting `refund_reviews`, which
 * fails as soon as a review uses one of the values. The extra, unused enum
 * values are harmless to the previous code.
 */
export class AddRefundTriggerExpiredFailedAfterPayment1790101100000 implements MigrationInterface {
  name = 'AddRefundTriggerExpiredFailedAfterPayment1790101100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."refund_trigger_enum" ADD VALUE IF NOT EXISTS 'expired_after_payment'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."refund_trigger_enum" ADD VALUE IF NOT EXISTS 'failed_after_payment'`,
    );
  }

  public async down(): Promise<void> {
    // Intentionally empty: Postgres cannot drop enum values (see above).
  }
}
