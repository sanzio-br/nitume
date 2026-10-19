import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Owner answers rows 206, 221 (2026-10-19): "every task has deadlineAt";
 * "default deadlineAt = creation time + 24 h; backfill open tasks
 * createdAt + 24 h, closed tasks their closing time; then NOT NULL."
 *
 * - Closed = terminal (SETTLED, CANCELLED, FAILED, EXPIRED): the time of the
 *   newest history row into that status, else the row's updatedAt.
 * - Every other task: createdAt + 24 h (the approved default at the time of
 *   this migration; new tasks read ERRANDS_DEFAULT_DEADLINE_HOURS).
 * Rows that already have a deadline are not touched. errands has no guard
 * trigger; errand_status_history is only read.
 *
 * Note: an open task created more than 24 h ago gets a deadline in the
 * past. A RUNNER_ASSIGNED one is then expired by the next deadline sweep
 * (row 185); a PAYMENT_CONFIRMED one is reported to ops (rows 201, 220).
 *
 * Down drops NOT NULL only; the backfilled values stay (the original nulls
 * are not recorded).
 */
export class RequireErrandDeadline1790103300000 implements MigrationInterface {
  name = 'RequireErrandDeadline1790103300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "errands" e SET "deadlineAt" = COALESCE(
         (SELECT MAX(h."createdAt") FROM "errand_status_history" h
           WHERE h."errandId" = e.id AND h."toStatus"::text = e.status::text),
         e."updatedAt")
       WHERE e."deadlineAt" IS NULL AND e.status::text IN ('SETTLED', 'CANCELLED', 'FAILED', 'EXPIRED')`,
    );
    await queryRunner.query(
      `UPDATE "errands" SET "deadlineAt" = "createdAt" + interval '24 hours' WHERE "deadlineAt" IS NULL`,
    );
    await queryRunner.query(`ALTER TABLE "errands" ALTER COLUMN "deadlineAt" SET NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "errands" ALTER COLUMN "deadlineAt" DROP NOT NULL`);
  }
}
