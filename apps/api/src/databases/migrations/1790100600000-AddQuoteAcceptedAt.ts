import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Owner answer row 72 (2026-10-08): an admin may re-quote an ACCEPTED
 * errand; the customer must accept the new quote before paying. One
 * nullable column on `quotes` records the acceptance. Quotes of errands
 * that are already past QUOTED are backfilled as accepted at creation so
 * existing ACCEPTED errands stay payable.
 */
export class AddQuoteAcceptedAt1790100600000 implements MigrationInterface {
  name = 'AddQuoteAcceptedAt1790100600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "quotes" ADD "acceptedAt" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(
      `UPDATE "quotes" q SET "acceptedAt" = q."createdAt"
         FROM "errands" e
        WHERE e.id = q."errandId"
          AND e.status NOT IN ('DRAFT', 'REQUESTED', 'QUOTED')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "quotes" DROP COLUMN "acceptedAt"`);
  }
}
