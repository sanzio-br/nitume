import { assertTestDatabaseName } from './test-database';

/**
 * Runs in every e2e worker before its test file (rows 198, 219): the app
 * under test must never boot against a non-test database.
 */
assertTestDatabaseName(process.env.DATABASE_NAME);
