import { describe, expect, it, vi } from 'vitest';
import { REFRESH_COOKIE_NAME, RefreshCookieService } from './refresh-cookie.service';

const build = (nodeEnv: string, apiPrefix = 'api/v1') => {
  const values: Record<string, unknown> = { nodeEnv, apiPrefix };
  const config = { get: vi.fn((key: string, fallback?: unknown) => values[key] ?? fallback) };
  const tokens = { refreshTtlSeconds: vi.fn(() => 2_592_000) };
  return new RefreshCookieService(config as never, tokens as never);
};

const fakeRes = () => ({ cookie: vi.fn(), clearCookie: vi.fn() });

describe('RefreshCookieService (WQ-8)', () => {
  it('sets an HttpOnly, Secure, SameSite=Strict cookie on the web auth path for the refresh lifetime', () => {
    const res = fakeRes();
    build('production').set(res as never, 'rt.jwt.value');
    expect(res.cookie).toHaveBeenCalledWith(REFRESH_COOKIE_NAME, 'rt.jwt.value', {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/api/v1/auth/web',
      maxAge: 2_592_000_000,
    });
  });

  it('drops Secure only in development', () => {
    expect(build('development').baseOptions().secure).toBe(false);
    expect(build('test').baseOptions().secure).toBe(true);
    expect(build('staging').baseOptions().secure).toBe(true);
  });

  it('follows the API prefix for the cookie path', () => {
    expect(build('production', '/v2/').baseOptions().path).toBe('/v2/auth/web');
  });

  it('clears with the same name, path and flags', () => {
    const res = fakeRes();
    build('production').clear(res as never);
    expect(res.clearCookie).toHaveBeenCalledWith(REFRESH_COOKIE_NAME, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/api/v1/auth/web',
    });
  });

  it('reads the cookie from the Cookie header', () => {
    const svc = build('production');
    expect(svc.read({ headers: {} } as never)).toBeNull();
    expect(svc.read({ headers: { cookie: 'a=1; other=2' } } as never)).toBeNull();
    expect(svc.read({ headers: { cookie: `a=1; ${REFRESH_COOKIE_NAME}=x.y.z; b=2` } } as never)).toBe('x.y.z');
    expect(svc.read({ headers: { cookie: `${REFRESH_COOKIE_NAME}=` } } as never)).toBeNull();
    expect(svc.read({ headers: { cookie: `${REFRESH_COOKIE_NAME}=%E0%A4%A` } } as never)).toBeNull();
    expect(svc.read({ headers: { cookie: `x${REFRESH_COOKIE_NAME}=nope` } } as never)).toBeNull();
  });
});
