/**
 * Fail-fast environment checks run by ConfigModule before any provider is
 * built. Returns the env unchanged; throws to stop the process.
 */
const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

export const resolvePaymentsProvider = (env: Record<string, unknown>): string =>
  str(env.PAYMENTS_PROVIDER) ?? str(env.PAYMENTS_MPESA_TRANSPORT) ?? 'console';

export const validateEnv = (env: Record<string, unknown>): Record<string, unknown> => {
  const nodeEnv = str(env.NODE_ENV) ?? 'development';
  // Row 89: console (mock) callbacks are trusted, so production must never
  // run on it. An unset provider resolves to console and is refused too.
  if (nodeEnv === 'production' && resolvePaymentsProvider(env) === 'console') {
    throw new Error(
      'PAYMENTS_PROVIDER=console is not allowed when NODE_ENV=production: mock ' +
        'payment callbacks would be trusted. Set PAYMENTS_PROVIDER=payhero (or daraja) ' +
        'with its full configuration.',
    );
  }
  // Row 83: every quote gets an expiry; a bad TTL would store Invalid Date.
  const ttl = str(env.QUOTES_DEFAULT_TTL_HOURS);
  if (ttl !== undefined && !(Number.parseFloat(ttl) > 0)) {
    throw new Error(`QUOTES_DEFAULT_TTL_HOURS must be a positive number of hours (got '${ttl}')`);
  }
  // Row 154: ID/selfie images are never kept indefinitely.
  const retention = str(env.RUNNER_ID_RETENTION_DAYS);
  if (retention !== undefined && !(Number.parseInt(retention, 10) > 0)) {
    throw new Error(`RUNNER_ID_RETENTION_DAYS must be a positive number of days (got '${retention}')`);
  }
  return env;
};
