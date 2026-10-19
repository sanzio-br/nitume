/**
 * BullMQ queue names (§4.4, rows 26 and 50). Redis carries the jobs only;
 * PostgreSQL stays the source of truth for money and for every row a job
 * writes.
 */
export const NOTIFICATIONS_QUEUE = 'notifications';
export const MAINTENANCE_QUEUE = 'maintenance';
/**
 * Runner location writes (§4.2, §9): the last-known position on
 * `runner_profiles`, the sampled `runner_locations` trail, and the
 * geofenced ARRIVED (§4.3). The socket handler never writes PostgreSQL.
 */
export const LOCATION_QUEUE = 'location';
export const LOCATION_PERSIST_JOB = 'location-persist';
export const GEOFENCE_ARRIVAL_JOB = 'geofence-arrival';

/**
 * Whether this process runs queue workers and schedules repeatable jobs.
 * Set QUEUE_WORKERS_ENABLED=false on API-only instances so the worker pool
 * scales separately. Read at module definition time.
 */
export const queueWorkersEnabled = (): boolean =>
  (process.env.QUEUE_WORKERS_ENABLED ?? 'true').trim().toLowerCase() !== 'false';

/**
 * Maintenance job that confirms a payment with its provider after a
 * provider callback (row 73): callbacks are never trusted on their own.
 */
export const PAYMENT_VERIFY_JOB = 'payment-verify';
