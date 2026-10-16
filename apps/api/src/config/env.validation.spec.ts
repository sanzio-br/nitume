import { describe, expect, it } from 'vitest';
import { configuration } from './configuration';
import { validateEnv } from './env.validation';

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
    const env = { NODE_ENV: 'production', PAYMENTS_PROVIDER: 'payhero' };
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
