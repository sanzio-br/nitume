import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { assertTestDatabaseName, DEFAULT_TEST_DATABASE_NAME } from './test/support/test-database';

/**
 * Row 196 (owner, 2026-10-16): e2e runs use their own BullMQ prefix, so they
 * never share queues (or workers) with a dev server on the same Redis.
 * Override with NITUME_TEST_QUEUE_PREFIX; never set it to the dev/prod prefix.
 */
const testQueuePrefix = process.env.NITUME_TEST_QUEUE_PREFIX || 'nitume_test';
if (testQueuePrefix === (process.env.QUEUE_PREFIX || 'nitume')) {
  throw new Error(`NITUME_TEST_QUEUE_PREFIX must differ from the app queue prefix (${testQueuePrefix})`);
}

/**
 * Rows 198 and 219 (owner): e2e runs only on a dedicated test database.
 * DATABASE_NAME from .env or the shell is ignored here; override with
 * NITUME_TEST_DATABASE_NAME (must end in `_test`). Set on process.env so the
 * global setup sees it, and on test.env so every worker does; the Nest config
 * never overrides a variable already in process.env with .env.
 */
const testDatabaseName = assertTestDatabaseName(process.env.NITUME_TEST_DATABASE_NAME || DEFAULT_TEST_DATABASE_NAME);
process.env.DATABASE_NAME = testDatabaseName;

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    testTimeout: 20_000,
    env: { QUEUE_PREFIX: testQueuePrefix, DATABASE_NAME: testDatabaseName },
    globalSetup: ['./test/support/e2e-global-setup.ts'],
    setupFiles: ['./test/support/e2e-guard.ts'],
  },
});
