import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Owner answers rows 42-44 (2026-10-08): the merchant (or an admin) supplies
 * the Till/Paybill details for the merchant_direct route; the customer only
 * picks the route. Four nullable columns on `errands`, nothing else.
 */
export class AddErrandMerchantDetails1790100500000 implements MigrationInterface {
  name = 'AddErrandMerchantDetails1790100500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "errands" ADD "merchantName" character varying(120)`);
    await queryRunner.query(`ALTER TABLE "errands" ADD "merchantTillNumber" character varying(16)`);
    await queryRunner.query(
      `ALTER TABLE "errands" ADD "merchantPaybillNumber" character varying(16)`,
    );
    await queryRunner.query(
      `ALTER TABLE "errands" ADD "merchantAccountReference" character varying(40)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "errands" DROP COLUMN "merchantAccountReference"`);
    await queryRunner.query(`ALTER TABLE "errands" DROP COLUMN "merchantPaybillNumber"`);
    await queryRunner.query(`ALTER TABLE "errands" DROP COLUMN "merchantTillNumber"`);
    await queryRunner.query(`ALTER TABLE "errands" DROP COLUMN "merchantName"`);
  }
}
