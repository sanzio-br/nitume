import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { config as loadDotEnv } from 'dotenv';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import {
  assertConnectedToTestDatabase,
  assertTestDatabaseName,
  resetTestDatabase,
  RunSql,
} from './test-database';

/**
 * e2e global setup (rows 198, 199, 219): refuses to run unless DATABASE_NAME
 * is a test database, checks its migrations are current, then empties it
 * before and after the run. Redis cleanup touches only `<test prefix>:*` keys.
 */
const MIGRATIONS_DIR = join(__dirname, '../../src/databases/migrations');

/** One dedicated connection (a query runner), so BEGIN/COMMIT share it. */
const connect = async (): Promise<{
  close: () => Promise<void>;
  run: RunSql;
}> => {
  const database = assertTestDatabaseName(process.env.DATABASE_NAME);
  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: Number.parseInt(process.env.DATABASE_PORT ?? '5432', 10),
    username: process.env.DATABASE_USER ?? 'nitume',
    password: process.env.DATABASE_PASSWORD,
    database,
  });
  await ds.initialize();
  const runner = ds.createQueryRunner();
  await runner.connect();
  const run: RunSql = (sql, params) => runner.query(sql, params);
  const close = async (): Promise<void> => {
    await runner.release();
    await ds.destroy();
  };
  try {
    await assertConnectedToTestDatabase(run);
  } catch (err) {
    await close();
    throw err;
  }
  return { close, run };
};

const assertMigrationsCurrent = async (run: RunSql): Promise<void> => {
  const files = readdirSync(MIGRATIONS_DIR)
    .map((f) => /^(\d+)-.+\.ts$/.exec(f)?.[1])
    .filter((t): t is string => t !== undefined);
  const applied = new Set(
    (await run('SELECT "timestamp"::text AS ts FROM "migrations"')).map(
      (r: { ts: string }) => r.ts,
    ),
  );
  const pending = files.filter((t) => !applied.has(t));
  if (pending.length > 0) {
    throw new Error(
      `Test database ${process.env.DATABASE_NAME} has ${pending.length} pending migration(s). ` +
        `Run: DATABASE_NAME=${process.env.DATABASE_NAME} npm run migration:run`,
    );
  }
};

/** Deletes only `<prefix>:*` keys, and only for a test prefix (row 199). */
const cleanTestRedisKeys = async (): Promise<void> => {
  const prefix = process.env.NITUME_TEST_QUEUE_PREFIX || 'nitume_test';
  if (!/^[a-z0-9_]+_test$/.test(prefix)) {
    return;
  }
  const redis = new Redis({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number.parseInt(process.env.REDIS_PORT ?? '6379', 10),
    lazyConnect: true,
  });
  await redis.connect();
  try {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(
        cursor,
        'MATCH',
        `${prefix}:*`,
        'COUNT',
        500,
      );
      cursor = next;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== '0');
  } finally {
    redis.disconnect();
  }
};

const resetAll = async (): Promise<void> => {
  const { close, run } = await connect();
  try {
    await assertMigrationsCurrent(run);
    await resetTestDatabase(run);
  } finally {
    await close();
  }
  await cleanTestRedisKeys();
};

export default async function setup(): Promise<() => Promise<void>> {
  loadDotEnv();
  await resetAll();
  return resetAll;
}
