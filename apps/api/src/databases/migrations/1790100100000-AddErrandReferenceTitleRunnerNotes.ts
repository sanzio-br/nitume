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
    // Number existing rows explicitly: nextval() inside an UPDATE ... FROM
    // runs in join order, not the subquery's ORDER BY.
    await queryRunner.query(
      `UPDATE "errands" e SET "reference" = 'NT-' || (o.rn + 10000)
         FROM (SELECT id, row_number() OVER (ORDER BY "createdAt", id) AS rn FROM "errands") o
        WHERE e.id = o.id`,
    );
    // Continue after the backfilled numbers (NT-10001 when the table is empty).
    await queryRunner.query(
      `SELECT setval('errand_reference_seq', 10000 + (SELECT count(*) FROM "errands"), true)`,
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
