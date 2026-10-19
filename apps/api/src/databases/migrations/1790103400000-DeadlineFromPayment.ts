import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Owner answers rows 235, 239 (2026-10-19, option a): when the customer
 * gives no deadline ("Flexible"), the default window starts at payment
 * confirmation. Such a task keeps `deadlineAt` NULL until PAYMENT_CONFIRMED,
 * where the API sets payment time + ERRANDS_DEFAULT_DEADLINE_HOURS.
 *
 * NULL is allowed only in DRAFT, REQUESTED, QUOTED, ACCEPTED (before
 * payment) and CANCELLED (a Flexible task the customer cancelled before
 * paying never gets a deadline; every pre-payment state can only end in
 * CANCELLED). Every other status, PAYMENT_CONFIRMED onwards, needs a
 * deadline. A CANCELLED task cancelled after payment already has one; the
 * CHECK cannot tell the two apart, which is acceptable for a terminal state.
 *
 * Existing rows are not changed (row 240: backfilled deadlines stay).
 *
 * Down: rows with a NULL deadline get the row-221 values again (open:
 * createdAt + 24 h; CANCELLED: the time of its CANCELLED history row, else
 * updatedAt), then the CHECK is dropped and NOT NULL restored. No row is
 * deleted.
 */
export class DeadlineFromPayment1790103400000 implements MigrationInterface {
  name = 'DeadlineFromPayment1790103400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "errands" ALTER COLUMN "deadlineAt" DROP NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "errands" ADD CONSTRAINT "CHK_errands_deadline_from_payment" CHECK (
        "deadlineAt" IS NOT NULL OR "status"::text IN ('DRAFT', 'REQUESTED', 'QUOTED', 'ACCEPTED', 'CANCELLED')
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "errands" e SET "deadlineAt" = COALESCE(
         (SELECT MAX(h."createdAt") FROM "errand_status_history" h
           WHERE h."errandId" = e.id AND h."toStatus"::text = 'CANCELLED'),
         e."updatedAt")
       WHERE e."deadlineAt" IS NULL AND e.status::text = 'CANCELLED'`,
    );
    await queryRunner.query(
      `UPDATE "errands" SET "deadlineAt" = "createdAt" + interval '24 hours' WHERE "deadlineAt" IS NULL`,
    );
    await queryRunner.query(`ALTER TABLE "errands" DROP CONSTRAINT "CHK_errands_deadline_from_payment"`);
    await queryRunner.query(`ALTER TABLE "errands" ALTER COLUMN "deadlineAt" SET NOT NULL`);
  }
}
