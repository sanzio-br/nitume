import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reviewer follow-up (round 6): a payable/paid line's amount never exceeds
 * the cap stored on it when it was created (rows 105, 106). Lines without a
 * cap (runner fee, adjustments) are unaffected. Reversible.
 */
export class RunnerPayoutLinesAmountWithinCap1790101600000 implements MigrationInterface {
  name = 'RunnerPayoutLinesAmountWithinCap1790101600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "runner_payout_lines" ADD CONSTRAINT "CHK_runner_payout_lines_within_cap" CHECK ("capAmount" IS NULL OR "amount" IS NULL OR "amount" <= "capAmount")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "runner_payout_lines" DROP CONSTRAINT "CHK_runner_payout_lines_within_cap"`,
    );
  }
}
