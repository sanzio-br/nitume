/**
 * BullMQ queue names (§4.4, rows 26 and 50). Redis carries the jobs only;
 * PostgreSQL stays the source of truth for money and for every row a job
 * writes.
 */
export const NOTIFICATIONS_QUEUE = 'notifications';
export const MAINTENANCE_QUEUE = 'maintenance';

/**
 * Whether this process runs queue workers and schedules repeatable jobs.
 * Set QUEUE_WORKERS_ENABLED=false on API-only instances so the worker pool
 * scales separately. Read at module definition time.
 */
export const queueWorkersEnabled = (): boolean =>
  (process.env.QUEUE_WORKERS_ENABLED ?? 'true').trim().toLowerCase() !== 'false';
