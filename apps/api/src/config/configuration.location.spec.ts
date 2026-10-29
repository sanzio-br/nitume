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

describe('web runner presence config (issue #36, owner Q14-5, Q14-6)', () => {
  const PRESENCE_KEYS = [
    'LOCATION_PRESENCE_TTL_SECONDS',
    'LOCATION_WEB_STALE_SECONDS',
    'LOCATION_WEB_OFFLINE_SECONDS',
    'LOCATION_WEB_SWEEP_INTERVAL_SECONDS',
  ];
  const saved = Object.fromEntries(PRESENCE_KEYS.map((k) => [k, process.env[k]]));
  afterEach(() => {
    for (const k of PRESENCE_KEYS) {
      if (saved[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = saved[k];
      }
    }
  });

  it('defaults: 24 h record, flag after 90 s, offline after 300 s, sweep every 30 s', () => {
    for (const k of PRESENCE_KEYS) {
      delete process.env[k];
    }
    const c = configuration();
    expect(c.location).toMatchObject({ presenceTtlSeconds: 86_400, webStaleSeconds: 90, webOfflineSeconds: 300 });
    expect(c.queue.webPingSweepIntervalSeconds).toBe(30);
  });

  it('every value is configurable, with floors', () => {
    Object.assign(process.env, {
      LOCATION_PRESENCE_TTL_SECONDS: '3600',
      LOCATION_WEB_STALE_SECONDS: '120',
      LOCATION_WEB_OFFLINE_SECONDS: '600',
      LOCATION_WEB_SWEEP_INTERVAL_SECONDS: '15',
    });
    let c = configuration();
    expect(c.location).toMatchObject({ presenceTtlSeconds: 3600, webStaleSeconds: 120, webOfflineSeconds: 600 });
    expect(c.queue.webPingSweepIntervalSeconds).toBe(15);
    Object.assign(process.env, {
      LOCATION_PRESENCE_TTL_SECONDS: '1',
      LOCATION_WEB_STALE_SECONDS: '0',
      LOCATION_WEB_OFFLINE_SECONDS: '-5',
      LOCATION_WEB_SWEEP_INTERVAL_SECONDS: '1',
    });
    c = configuration();
    expect(c.location).toMatchObject({ presenceTtlSeconds: 60, webStaleSeconds: 1, webOfflineSeconds: 1 });
    expect(c.queue.webPingSweepIntervalSeconds).toBe(5);
  });
});
