/**
 * Resets application tables and re-applies all migrations.
 *
 * Usage: `npm run migration:refresh` (ts-node, chained with `seed:admin`).
 *
 * Drops every user table/sequence/type in the `public` schema but keeps the
 * postgis extension (its members are owned by the extension, and `nitume` is
 * not a superuser, so it cannot be re-created). Then runs all migrations.
 */
import 'reflect-metadata';
import { config as loadDotEnv } from 'dotenv';
import { DataSource, QueryRunner } from 'typeorm';
import { AppDataSource } from '../data-source';

loadDotEnv();

const nonExtensionObjects = async (
  queryRunner: QueryRunner,
  kinds: string,
  nameColumn: string,
): Promise<Array<{ fullName: string }>> => {
  return queryRunner.query(
    `SELECT CONCAT('public.', quote_ident(${nameColumn})) AS "fullName"
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = ANY(ARRAY[${kinds}])
        AND NOT EXISTS (
          SELECT 1 FROM pg_depend d
           WHERE d.objid = c.oid AND d.deptype = 'e'
        )
      ORDER BY ${nameColumn}`,
  );
};

const run = async (): Promise<void> => {
  const dataSource: DataSource = AppDataSource;
  await dataSource.initialize();
  const queryRunner = dataSource.createQueryRunner();
  try {
    for (const { fullName } of await nonExtensionObjects(queryRunner, `'r','p'`, `c.relname`)) {
      await queryRunner.query(`DROP TABLE ${fullName} CASCADE`);
    }
    for (const { fullName } of await nonExtensionObjects(queryRunner, `'S'`, `c.relname`)) {
      await queryRunner.query(`DROP SEQUENCE IF EXISTS ${fullName} CASCADE`);
    }
    const types = await queryRunner.query(
      `SELECT CONCAT('public.', quote_ident(t.typname)) AS "fullName"
         FROM pg_type t
         JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
          AND t.typtype IN ('e', 'c', 'd')
          AND NOT EXISTS (
            SELECT 1 FROM pg_depend d
             WHERE d.objid = t.oid AND d.deptype = 'e'
          )
        ORDER BY t.typname`,
    );
    for (const { fullName } of types) {
      await queryRunner.query(`DROP TYPE ${fullName} CASCADE`);
    }
    await queryRunner.release();
    const applied = await dataSource.runMigrations();
    process.stdout.write(
      `schema reset; applied ${applied.length} migration(s)\n`,
    );
  } finally {
    await dataSource.destroy();
  }
};

run().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : err}\n`);
  process.exitCode = 1;
});