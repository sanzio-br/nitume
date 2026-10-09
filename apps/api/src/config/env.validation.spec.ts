import { describe, expect, it } from 'vitest';
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
});
