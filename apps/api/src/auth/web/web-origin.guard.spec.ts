import { describe, expect, it } from 'vitest';
import { ApiError } from '../../common/api-error';
import { WebOriginGuard } from './web-origin.guard';

const guard = new WebOriginGuard({ get: () => ['https://web.nitume.test'] } as never);
const ctx = (headers: Record<string, string>) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ headers }) }) }) as never;

const codeOf = (headers: Record<string, string>): string | null => {
  try {
    guard.canActivate(ctx(headers));
    return null;
  } catch (e) {
    return e instanceof ApiError ? `${e.getStatus()} ${e.code}` : String(e);
  }
};

describe('WebOriginGuard (WQ-8 CSRF check)', () => {
  it('lets a configured website origin through', () => {
    expect(codeOf({ origin: 'https://web.nitume.test' })).toBeNull();
  });

  it('refuses a foreign or missing Origin with 403 web_origin_not_allowed', () => {
    expect(codeOf({ origin: 'https://evil.example' })).toBe('403 web_origin_not_allowed');
    expect(codeOf({ origin: 'https://web.nitume.test.evil.example' })).toBe('403 web_origin_not_allowed');
    expect(codeOf({ origin: 'null' })).toBe('403 web_origin_not_allowed');
    expect(codeOf({})).toBe('403 web_origin_not_allowed');
  });
});
