import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Owner decisions Q15/Q16: backend-generated errand `reference`
 * (`NT-<sequence>`, starting at NT-10001), optional customer `title`, and a
 * dedicated `runnerNotes` field. Existing rows are backfilled in creation
 * order.
 */
export class AddErrandReferenceTitleRunnerNotes1790100100000 implements MigrationInterface {
  name = 'AddErrandReferenceTitleRunnerNotes1790100100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SEQUENCE "errand_reference_seq" START WITH 10001`);
    await queryRunner.query(`ALTER TABLE "errands" ADD "reference" character varying(16)`);
    await queryRunner.query(
      `UPDATE "errands" e SET "reference" = 'NT-' || nextval('errand_reference_seq')
         FROM (SELECT id FROM "errands" ORDER BY "createdAt", id) o
        WHERE e.id = o.id`,
    );
    await queryRunner.query(
      `ALTER TABLE "errands" ALTER COLUMN "reference" SET DEFAULT ('NT-' || nextval('errand_reference_seq'))`,
    );
    await queryRunner.query(`ALTER TABLE "errands" ALTER COLUMN "reference" SET NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "errands" ADD CONSTRAINT "UQ_errands_reference" UNIQUE ("reference")`,
    );
    await queryRunner.query(`ALTER SEQUENCE "errand_reference_seq" OWNED BY "errands"."reference"`);
    await queryRunner.query(`ALTER TABLE "errands" ADD "title" character varying(120)`);
    await queryRunner.query(`ALTER TABLE "errands" ADD "runnerNotes" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "errands" DROP COLUMN "runnerNotes"`);
    await queryRunner.query(`ALTER TABLE "errands" DROP COLUMN "title"`);
    await queryRunner.query(`ALTER TABLE "errands" DROP CONSTRAINT "UQ_errands_reference"`);
    await queryRunner.query(`ALTER TABLE "errands" DROP COLUMN "reference"`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS "errand_reference_seq"`);
  }
}
