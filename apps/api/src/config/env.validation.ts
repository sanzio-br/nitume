import { parseServiceAreas } from '../runners/service-areas';

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
  // Row 224: an app Redis key prefix is a lowercase name ending in ':'.
  const keyPrefix = str(env.REDIS_KEY_PREFIX);
  if (keyPrefix !== undefined && !/^[a-z0-9_]+:$/.test(keyPrefix)) {
    throw new Error(`REDIS_KEY_PREFIX must be lowercase letters, digits or _ followed by ':' (got '${keyPrefix}')`);
  }
  // Row 221: the default task deadline is a positive number of hours.
  const deadlineHours = str(env.ERRANDS_DEFAULT_DEADLINE_HOURS);
  if (deadlineHours !== undefined && !(Number.parseFloat(deadlineHours) > 0)) {
    throw new Error(`ERRANDS_DEFAULT_DEADLINE_HOURS must be a positive number of hours (got '${deadlineHours}')`);
  }
  // Row 83: every quote gets an expiry; a bad TTL would store Invalid Date.
  const ttl = str(env.QUOTES_DEFAULT_TTL_HOURS);
  if (ttl !== undefined && !(Number.parseFloat(ttl) > 0)) {
    throw new Error(`QUOTES_DEFAULT_TTL_HOURS must be a positive number of hours (got '${ttl}')`);
  }
  // Row 159: the payout request minimum is a KES amount (default 500).
  const minimum = str(env.MIN_RUNNER_PAYOUT_REQUEST);
  if (minimum !== undefined && !(Number.parseFloat(minimum) >= 0)) {
    throw new Error(`MIN_RUNNER_PAYOUT_REQUEST must be a KES amount of 0 or more (got '${minimum}')`);
  }
  // Review minor 3, row 162: ID/selfie images need real restricted storage in
  // production, under their own credential, isolated from ordinary media.
  if (nodeEnv === 'production') {
    const driver = str(env.RUNNER_ID_STORAGE_DRIVER) ?? str(env.EVIDENCE_STORAGE_DRIVER) ?? 'console';
    if (driver !== 'cloudinary') {
      throw new Error(
        `RUNNER_ID_STORAGE_DRIVER=${driver} is not allowed when NODE_ENV=production: ID and selfie ` +
          'images would not be stored. Set RUNNER_ID_STORAGE_DRIVER=cloudinary with CLOUDINARY_ID_API_KEY / CLOUDINARY_ID_API_SECRET.',
      );
    }
    const idKey = str(env.CLOUDINARY_ID_API_KEY);
    if (!idKey || !str(env.CLOUDINARY_ID_API_SECRET) || !(str(env.CLOUDINARY_ID_CLOUD_NAME) ?? str(env.CLOUDINARY_CLOUD_NAME))) {
      throw new Error(
        'CLOUDINARY_ID_API_KEY, CLOUDINARY_ID_API_SECRET and a cloud name (CLOUDINARY_ID_CLOUD_NAME or ' +
          'CLOUDINARY_CLOUD_NAME) are required when NODE_ENV=production (row 162: a restricted credential for ID images).',
      );
    }
    if (idKey === str(env.CLOUDINARY_API_KEY)) {
      throw new Error(
        'CLOUDINARY_ID_API_KEY must differ from CLOUDINARY_API_KEY (row 162: ID images use their own restricted credential).',
      );
    }
  }
  // Row 154: ID/selfie images are never kept indefinitely.
  const retention = str(env.RUNNER_ID_RETENTION_DAYS);
  if (retention !== undefined && !(Number.parseInt(retention, 10) > 0)) {
    throw new Error(`RUNNER_ID_RETENTION_DAYS must be a positive number of days (got '${retention}')`);
  }
  // Row 116: a malformed service-area list stops the start-up, not a request.
  parseServiceAreas(str(env.RUNNER_SERVICE_AREAS));
  return env;
};
