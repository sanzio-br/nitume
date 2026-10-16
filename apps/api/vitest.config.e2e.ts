import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

/**
 * Row 196 (owner, 2026-10-16): e2e runs use their own BullMQ prefix, so they
 * never share queues (or workers) with a dev server on the same Redis.
 * Override with NITUME_TEST_QUEUE_PREFIX; never set it to the dev/prod prefix.
 */
const testQueuePrefix = process.env.NITUME_TEST_QUEUE_PREFIX || 'nitume_test';
if (testQueuePrefix === (process.env.QUEUE_PREFIX || 'nitume')) {
  throw new Error(`NITUME_TEST_QUEUE_PREFIX must differ from the app queue prefix (${testQueuePrefix})`);
}

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    testTimeout: 20_000,
    env: { QUEUE_PREFIX: testQueuePrefix },
  },
});
