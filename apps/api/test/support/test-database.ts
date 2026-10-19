import type { DataSource } from 'typeorm';

/**
 * Rows 198 and 219 (owner): e2e suites run only against a dedicated test
 * database, never the dev database. Append-only guard triggers may be lifted
 * only there.
 *
 * A test database name must end in `_test` (default `nitume_test`, override
 * with NITUME_TEST_DATABASE_NAME).
 */
export const DEFAULT_TEST_DATABASE_NAME = 'nitume_test';

const TEST_DATABASE_NAME = /^[a-z0-9_]+_test$/;

export const isTestDatabaseName = (name: string | undefined): boolean =>
  typeof name === 'string' && TEST_DATABASE_NAME.test(name);

/** Throws unless `name` is a test database name. */
export const assertTestDatabaseName = (name: string | undefined): string => {
  if (!isTestDatabaseName(name)) {
    throw new Error(
      `Refusing to run e2e against database "${name ?? '(unset)'}": ` +
        `DATABASE_NAME must be a dedicated test database ending in "_test" (rows 198, 219).`,
    );
  }
  return name as string;
};

/** Runs one SQL statement and resolves to its rows (TypeORM `query` or a `pg` client wrapper). */
export type RunSql = (sql: string, params?: unknown[]) => Promise<any[]>;

/** Throws unless the live connection is on a test database (checks the server, not the env). */
export const assertConnectedToTestDatabase = async (
  run: RunSql,
): Promise<void> => {
  const rows: { name: string }[] = await run(
    'SELECT current_database() AS name',
  );
  assertTestDatabaseName(rows[0]?.name);
};

/** Tables with append-only guard triggers (row-level and BEFORE TRUNCATE). */
export const APPEND_ONLY_TABLES = [
  'refund_payout_corrections',
  'runner_payout_lines',
  'runner_payout_requests',
  'task_exposure_overrides',
  'verification_document_access_log',
] as const;

/**
 * Tables kept by a reset: the migration ledger, the PostGIS reference table
 * and `payment_type`, the reference rows PaymentsService seeds at bootstrap.
 * That seed is find-then-insert, so parallel e2e apps booting on an empty
 * table race on IDX_payment_type_code; keeping the rows avoids it.
 */
const KEEP_TABLES = new Set(['migrations', 'spatial_ref_sys', 'payment_type']);

const quoted = (table: string): string => `"${table.replace(/"/g, '""')}"`;

/**
 * Cleanup of tracked rows from an append-only table. The guard trigger is
 * lifted inside one transaction: ALTER TABLE holds its lock until commit, so
 * no other session ever sees the table unguarded. Refuses to run outside a
 * test database.
 */
export const withAppendOnlyGuardLifted = async (
  ds: DataSource,
  table: (typeof APPEND_ONLY_TABLES)[number],
  cleanup: (
    query: (sql: string, params?: unknown[]) => Promise<unknown>,
  ) => Promise<void>,
): Promise<void> => {
  await ds.transaction(async (manager) => {
    await assertConnectedToTestDatabase((sql, params) =>
      manager.query(sql, params),
    );
    await manager.query(`ALTER TABLE ${quoted(table)} DISABLE TRIGGER USER`);
    await cleanup((sql, params) => manager.query(sql, params));
    await manager.query(`ALTER TABLE ${quoted(table)} ENABLE TRIGGER USER`);
  });
};

/**
 * Empties every table in the public schema except KEEP_TABLES, in one
 * transaction. Refuses to run outside a test database.
 */
export const resetTestDatabase = async (run: RunSql): Promise<void> => {
  await run('BEGIN');
  try {
    await assertConnectedToTestDatabase(run);
    const rows: { tablename: string }[] = await run(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    );
    const tables = rows
      .map((r) => r.tablename)
      .filter((t) => !KEEP_TABLES.has(t));
    const guarded = APPEND_ONLY_TABLES.filter((t) => tables.includes(t));
    for (const table of guarded) {
      await run(`ALTER TABLE ${quoted(table)} DISABLE TRIGGER USER`);
    }
    if (tables.length > 0) {
      await run(
        `TRUNCATE ${tables.map(quoted).join(', ')} RESTART IDENTITY CASCADE`,
      );
    }
    for (const table of guarded) {
      await run(`ALTER TABLE ${quoted(table)} ENABLE TRIGGER USER`);
    }
    await run('COMMIT');
  } catch (err) {
    await run('ROLLBACK');
    throw err;
  }
};
