import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Owner answer row 80 (2026-10-09): when merchant details change after a
 * merchant-direct payment started, warn the customer (never block). One
 * nullable timestamp on `errands` lets the customer app restore the warning
 * after a reload (spec N-14). Reversible.
 */
export class AddErrandMerchantDetailsUpdatedAt1790101000000 implements MigrationInterface {
  name = 'AddErrandMerchantDetailsUpdatedAt1790101000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "errands" ADD "merchantDetailsUpdatedAt" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "errands" DROP COLUMN "merchantDetailsUpdatedAt"`);
  }
}
