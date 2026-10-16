import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Owner answer row 195 (2026-10-16): a government ID image records which
 * side it shows. `runner_verifications.side` (front | back): required on new
 * government_id uploads (checked by the API), never set for any other type.
 * Rows uploaded before this change keep null (dev/test data, as row 156).
 * Reversible.
 */
export class AddVerificationSide1790103000000 implements MigrationInterface {
  name = 'AddVerificationSide1790103000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "public"."runner_verification_side_enum" AS ENUM('front', 'back')`);
    await queryRunner.query(`ALTER TABLE "runner_verifications" ADD "side" "public"."runner_verification_side_enum"`);
    await queryRunner.query(
      `ALTER TABLE "runner_verifications" ADD CONSTRAINT "CHK_runner_verifications_side" CHECK (
        "side" IS NULL OR "verificationType"::text = 'government_id'
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "runner_verifications" DROP CONSTRAINT "CHK_runner_verifications_side"`);
    await queryRunner.query(`ALTER TABLE "runner_verifications" DROP COLUMN "side"`);
    await queryRunner.query(`DROP TYPE "public"."runner_verification_side_enum"`);
  }
}
