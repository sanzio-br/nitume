import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * At most one non-failed main (service + runner fee) payment per errand, so
 * two concurrent initiates (no key, or different keys) cannot both create a
 * payment and push STK. Price-difference records (priceChangeRequestId set)
 * and failed attempts are outside the index. Index only, no schema change.
 */
export class AddPaymentsActivePrimaryUniqueIndex1790100400000 implements MigrationInterface {
  name = 'AddPaymentsActivePrimaryUniqueIndex1790100400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const duplicates: { errandId: string }[] = await queryRunner.query(
      `SELECT "errandId" FROM "payments"
        WHERE "status" <> 'failed' AND "priceChangeRequestId" IS NULL
        GROUP BY "errandId" HAVING count(*) > 1`,
    );
    if (duplicates.length > 0) {
      throw new Error(
        `Errands with more than one active main payment need manual review before this index can be created: ${duplicates
          .map((d) => d.errandId)
          .join(', ')}`,
      );
    }
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_payments_errand_active_primary" ON "payments" ("errandId") WHERE "status" <> 'failed' AND "priceChangeRequestId" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_payments_errand_active_primary"`);
  }
}
