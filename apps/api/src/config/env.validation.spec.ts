import { describe, expect, it } from 'vitest';
import { configuration, resolveIdCloudinary } from './configuration';
import { validateEnv } from './env.validation';

const PRODUCTION_ID_STORAGE = {
  RUNNER_ID_STORAGE_DRIVER: 'cloudinary',
  CLOUDINARY_CLOUD_NAME: 'demo-cloud',
  CLOUDINARY_API_KEY: 'media-key',
  CLOUDINARY_ID_API_KEY: 'id-key',
  CLOUDINARY_ID_API_SECRET: 'id-secret',
};

describe('validateEnv (row 89)', () => {
  it('refuses production with the console payments provider', () => {
    expect(() => validateEnv({ NODE_ENV: 'production', PAYMENTS_PROVIDER: 'console' })).toThrow(
      /PAYMENTS_PROVIDER=console is not allowed/,
    );
  });

  it('refuses production when no provider is set (defaults to console)', () => {
    expect(() => validateEnv({ NODE_ENV: 'production' })).toThrow(/not allowed/);
    expect(() =>
      validateEnv({ NODE_ENV: 'production', PAYMENTS_MPESA_TRANSPORT: 'console' }),
    ).toThrow(/not allowed/);
  });

  it('accepts production with a real provider', () => {
    const env = { NODE_ENV: 'production', PAYMENTS_PROVIDER: 'payhero', ...PRODUCTION_ID_STORAGE };
    expect(validateEnv(env)).toBe(env);
  });

  it('accepts console outside production', () => {
    for (const NODE_ENV of ['development', 'test', 'staging', undefined]) {
      expect(() => validateEnv({ NODE_ENV, PAYMENTS_PROVIDER: 'console' })).not.toThrow();
    }
  });

  it('refuses a non-positive or non-numeric QUOTES_DEFAULT_TTL_HOURS (row 83)', () => {
    for (const QUOTES_DEFAULT_TTL_HOURS of ['0', '-1', 'abc']) {
      expect(() => validateEnv({ QUOTES_DEFAULT_TTL_HOURS })).toThrow(/QUOTES_DEFAULT_TTL_HOURS/);
    }
    expect(() => validateEnv({ QUOTES_DEFAULT_TTL_HOURS: '48' })).not.toThrow();
  });

  it('refuses a negative or non-numeric MIN_RUNNER_PAYOUT_REQUEST (row 159)', () => {
    for (const MIN_RUNNER_PAYOUT_REQUEST of ['-1', 'abc']) {
      expect(() => validateEnv({ MIN_RUNNER_PAYOUT_REQUEST })).toThrow(/MIN_RUNNER_PAYOUT_REQUEST/);
    }
    expect(() => validateEnv({ MIN_RUNNER_PAYOUT_REQUEST: '500' })).not.toThrow();
  });
});

describe('configuration runnerPayouts.minimumRequestAmount (row 159)', () => {
  const read = (value: string | undefined) => {
    const before = process.env.MIN_RUNNER_PAYOUT_REQUEST;
    if (value === undefined) {
      delete process.env.MIN_RUNNER_PAYOUT_REQUEST;
    } else {
      process.env.MIN_RUNNER_PAYOUT_REQUEST = value;
    }
    try {
      return configuration().runnerPayouts.minimumRequestAmount;
    } finally {
      if (before === undefined) {
        delete process.env.MIN_RUNNER_PAYOUT_REQUEST;
      } else {
        process.env.MIN_RUNNER_PAYOUT_REQUEST = before;
      }
    }
  };

  it('defaults to KES 500 and reads MIN_RUNNER_PAYOUT_REQUEST', () => {
    expect(read(undefined)).toBe(500);
    expect(read('750')).toBe(750);
  });

  it('no longer reads the round-8 RUNNER_PAYOUT_REQUEST_MINIMUM_KES', () => {
    process.env.RUNNER_PAYOUT_REQUEST_MINIMUM_KES = '0';
    try {
      expect(read(undefined)).toBe(500);
    } finally {
      delete process.env.RUNNER_PAYOUT_REQUEST_MINIMUM_KES;
    }
  });
});

describe('ID image storage in production (review minor 3, row 162)', () => {
  const base = { NODE_ENV: 'production', PAYMENTS_PROVIDER: 'payhero' };

  it('refuses the console driver, also when only the evidence driver is set or nothing is', () => {
    expect(() => validateEnv({ ...base, ...PRODUCTION_ID_STORAGE, RUNNER_ID_STORAGE_DRIVER: 'console' })).toThrow(
      /RUNNER_ID_STORAGE_DRIVER=console is not allowed/,
    );
    const { RUNNER_ID_STORAGE_DRIVER: _d, ...noDriver } = PRODUCTION_ID_STORAGE;
    expect(() => validateEnv({ ...base, ...noDriver })).toThrow(/RUNNER_ID_STORAGE_DRIVER=console/);
    expect(() => validateEnv({ ...base, ...noDriver, EVIDENCE_STORAGE_DRIVER: 'cloudinary' })).not.toThrow();
  });

  it('refuses a missing restricted credential, and one equal to the media key', () => {
    const { CLOUDINARY_ID_API_KEY: _k, ...noKey } = PRODUCTION_ID_STORAGE;
    expect(() => validateEnv({ ...base, ...noKey })).toThrow(/CLOUDINARY_ID_API_KEY/);
    const { CLOUDINARY_ID_API_SECRET: _s, ...noSecret } = PRODUCTION_ID_STORAGE;
    expect(() => validateEnv({ ...base, ...noSecret })).toThrow(/CLOUDINARY_ID_API_SECRET/);
    expect(() => validateEnv({ ...base, ...PRODUCTION_ID_STORAGE, CLOUDINARY_ID_API_KEY: 'media-key' })).toThrow(
      /must differ/,
    );
  });

  it('does not apply outside production', () => {
    expect(() => validateEnv({ NODE_ENV: 'development' })).not.toThrow();
  });
});

describe('resolveIdCloudinary (row 162)', () => {
  it('uses the ID credential, and falls back to the media one only outside production', () => {
    const shared = { CLOUDINARY_CLOUD_NAME: 'c', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 's' };
    expect(resolveIdCloudinary({ ...shared, NODE_ENV: 'development' })).toEqual({ cloudName: 'c', apiKey: 'k', apiSecret: 's' });
    expect(resolveIdCloudinary({ ...shared, NODE_ENV: 'production' })).toEqual({ cloudName: 'c', apiKey: null, apiSecret: null });
    expect(
      resolveIdCloudinary({ ...shared, NODE_ENV: 'production', CLOUDINARY_ID_API_KEY: 'ik', CLOUDINARY_ID_API_SECRET: 'is' }),
    ).toEqual({ cloudName: 'c', apiKey: 'ik', apiSecret: 'is' });
  });
});
