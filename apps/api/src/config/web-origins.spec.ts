import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.validation';
import { parseWebOrigins, webOriginsError } from './web-origins';

describe('WEB_ORIGINS (WQ-8)', () => {
  it('defaults to the website dev server in development only', () => {
    expect(parseWebOrigins(undefined, 'development')).toEqual(['http://localhost:4200']);
    expect(parseWebOrigins('', 'production')).toEqual([]);
    expect(parseWebOrigins(undefined, 'test')).toEqual([]);
  });

  it('parses a comma-separated list of exact origins, deduplicated', () => {
    expect(parseWebOrigins(' https://nitume.co.ke, https://www.nitume.co.ke ,https://nitume.co.ke', 'production')).toEqual([
      'https://nitume.co.ke',
      'https://www.nitume.co.ke',
    ]);
  });

  it('never accepts a wildcard, a path or a trailing slash', () => {
    expect(webOriginsError('*')).toMatch(/not allowed/);
    expect(webOriginsError('https://*.nitume.co.ke')).toMatch(/not allowed/);
    expect(webOriginsError('https://nitume.co.ke/')).toMatch(/no path/);
    expect(webOriginsError('nitume.co.ke')).toMatch(/scheme/);
    expect(() => parseWebOrigins('*', 'production')).toThrow();
    expect(() => validateEnv({ WEB_ORIGINS: 'https://ok.example,*' })).toThrow(/WEB_ORIGINS/);
    expect(() => validateEnv({ WEB_ORIGINS: 'https://ok.example' })).not.toThrow();
  });
});
