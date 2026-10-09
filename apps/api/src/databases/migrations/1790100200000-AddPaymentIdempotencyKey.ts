import { MigrationInterface, QueryRunner } from 'typeorm';

/** Owner decision (BOARD row 24, A-7): nullable unique payments.idempotencyKey. */
export class AddPaymentIdempotencyKey1790100200000 implements MigrationInterface {
  name = 'AddPaymentIdempotencyKey1790100200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payments" ADD "idempotencyKey" character varying(128)`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_payments_idempotency_key" ON "payments" ("idempotencyKey")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_payments_idempotency_key"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "idempotencyKey"`);
  }
}
