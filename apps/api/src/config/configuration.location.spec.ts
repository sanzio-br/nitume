import { afterEach, describe, expect, it } from 'vitest';
import { configuration } from './configuration';

const KEYS = [
  'LOCATION_PING_MIN_INTERVAL_MS',
  'LOCATION_PING_MAX_AGE_SECONDS',
  'LOCATION_GEOFENCE_RADIUS_M',
  'LOCATION_PERSIST_ENABLED',
  'LOCATION_RETENTION_DAYS',
  'LOCATION_RETENTION_CRON',
  'EVIDENCE_MAX_UPLOAD_BYTES',
];

describe('location and evidence config (rows 247, 252, 253)', () => {
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = saved[k];
      }
    }
  });

  it('defaults: 2 s between pings, 60 s max age, 100 m radius, job pings stored, 90-day retention, 10 MB evidence', () => {
    for (const k of KEYS) {
      delete process.env[k];
    }
    const c = configuration();
    expect(c.location).toMatchObject({
      pingMinIntervalMs: 2000,
      pingMaxAgeSeconds: 60,
      geofenceRadiusMeters: 100,
      persistEnabled: true,
      retentionDays: 90,
      retentionCron: '30 3 * * *',
    });
    expect(c.evidence.maxUploadBytes).toBe(10 * 1024 * 1024);
  });

  it('every value is configurable', () => {
    Object.assign(process.env, {
      LOCATION_PING_MIN_INTERVAL_MS: '3000',
      LOCATION_PING_MAX_AGE_SECONDS: '30',
      LOCATION_GEOFENCE_RADIUS_M: '150',
      LOCATION_PERSIST_ENABLED: 'false',
      LOCATION_RETENTION_DAYS: '30',
      LOCATION_RETENTION_CRON: '0 4 * * *',
      EVIDENCE_MAX_UPLOAD_BYTES: '5242880',
    });
    const c = configuration();
    expect(c.location).toMatchObject({
      pingMinIntervalMs: 3000,
      pingMaxAgeSeconds: 30,
      geofenceRadiusMeters: 150,
      persistEnabled: false,
      retentionDays: 30,
      retentionCron: '0 4 * * *',
    });
    expect(c.evidence.maxUploadBytes).toBe(5 * 1024 * 1024);
  });
});
