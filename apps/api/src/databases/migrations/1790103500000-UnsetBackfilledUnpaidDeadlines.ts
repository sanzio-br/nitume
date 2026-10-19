import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Owner answer row 240 (2026-10-19): unpaid tasks whose deadline came from
 * the row-221 default (backfill, or the round-13 "creation + 24 h" code)
 * become Flexible again, so their clock starts at payment (rows 235, 239).
 *
 * Match: status DRAFT, REQUESTED, QUOTED or ACCEPTED, and deadlineAt within
 * 10 seconds of createdAt + 24 h. The backfill wrote it exactly; the
 * round-13 code computed it a few milliseconds before the insert. A
 * customer deadline is end of day local (Today / Tomorrow chips, 23:59), so
 * only a "Tomorrow" chosen in the last 10 seconds of a day could match.
 * Every other status and every other deadline is left alone. Urgency is not
 * touched: a 24 h deadline and no deadline both derive `standard`.
 *
 * Down (lossy): sets createdAt + 24 h on every unpaid task with no
 * deadline. It cannot tell the rows this migration changed from tasks
 * created Flexible afterwards, so those get the row-221 value too.
 */
export class UnsetBackfilledUnpaidDeadlines1790103500000 implements MigrationInterface {
  name = 'UnsetBackfilledUnpaidDeadlines1790103500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "errands" SET "deadlineAt" = NULL
        WHERE "status"::text IN ('DRAFT', 'REQUESTED', 'QUOTED', 'ACCEPTED')
          AND "deadlineAt" IS NOT NULL
          AND abs(extract(epoch FROM ("deadlineAt" - ("createdAt" + interval '24 hours')))) <= 10`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "errands" SET "deadlineAt" = "createdAt" + interval '24 hours'
        WHERE "status"::text IN ('DRAFT', 'REQUESTED', 'QUOTED', 'ACCEPTED') AND "deadlineAt" IS NULL`,
    );
  }
}
