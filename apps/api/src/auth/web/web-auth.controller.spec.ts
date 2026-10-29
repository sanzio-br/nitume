import { HttpStatus, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../common/api-error';
import { WebAuthController } from './web-auth.controller';

const build = (overrides: Record<string, unknown> = {}) => {
  const auth = {
    verifyOtpAndLogin: vi.fn(() =>
      Promise.resolve({ user: { id: 'u-1' }, tokens: { accessToken: 'at', refreshToken: 'rt' } }),
    ),
    verifyEmailOtpAndLogin: vi.fn(() =>
      Promise.resolve({ user: { id: 'a-1' }, tokens: { accessToken: 'at2', refreshToken: 'rt2' } }),
    ),
    refresh: vi.fn(() => Promise.resolve({ accessToken: 'at-new', refreshToken: 'rt-new' })),
    logout: vi.fn(() => Promise.resolve({ message: 'Signed out' })),
    ...overrides,
  };
  const cookie = { set: vi.fn(), clear: vi.fn(), read: vi.fn((): string | null => 'rt-old') };
  const controller = new WebAuthController(auth as never, cookie as never);
  const res = {} as never;
  const req = {} as never;
  return { controller, auth, cookie, res, req };
};

const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => (e instanceof ApiError ? `${e.getStatus()} ${e.code}` : String(e)),
  );

describe('WebAuthController (WQ-8)', () => {
  it('phone OTP verify sets the cookie and returns only the access token', async () => {
    const { controller, auth, cookie, res } = build();
    const body = await controller.verifyOtp({ phone: '0712345678', code: '123456' } as never, res);
    expect(auth.verifyOtpAndLogin).toHaveBeenCalledWith({ phone: '0712345678', code: '123456', role: undefined });
    expect(cookie.set).toHaveBeenCalledWith(res, 'rt');
    expect(body).toEqual({ user: { id: 'u-1' }, tokens: { accessToken: 'at' } });
  });

  it('email OTP verify (admin) sets the cookie the same way', async () => {
    const { controller, cookie, res } = build();
    const body = await controller.verifyEmailOtp({ email: 'a@b.co', code: '123456' } as never, res);
    expect(cookie.set).toHaveBeenCalledWith(res, 'rt2');
    expect(body.tokens).toEqual({ accessToken: 'at2' });
  });

  it('a failed verify sets no cookie', async () => {
    const { controller, cookie, res } = build({
      verifyOtpAndLogin: vi.fn(() => Promise.reject(new UnauthorizedException())),
    });
    await expect(controller.verifyOtp({ phone: '0712345678', code: '000000' } as never, res)).rejects.toThrow();
    expect(cookie.set).not.toHaveBeenCalled();
  });

  it('refresh rotates the cookie through AuthService.refresh', async () => {
    const { controller, auth, cookie, res, req } = build();
    expect(await controller.refresh(req, res)).toEqual({ accessToken: 'at-new' });
    expect(auth.refresh).toHaveBeenCalledWith('rt-old');
    expect(cookie.set).toHaveBeenCalledWith(res, 'rt-new');
    expect(cookie.clear).not.toHaveBeenCalled();
  });

  it('refresh without a cookie is 401 refresh_cookie_missing', async () => {
    const { controller, auth, cookie, res, req } = build();
    cookie.read.mockReturnValue(null);
    expect(await codeOf(controller.refresh(req, res))).toBe('401 refresh_cookie_missing');
    expect(auth.refresh).not.toHaveBeenCalled();
  });

  it('refresh with a revoked or invalid cookie clears it and answers 401 refresh_invalid', async () => {
    const { controller, cookie, res, req } = build({
      refresh: vi.fn(() => Promise.reject(new UnauthorizedException('Refresh token revoked or expired'))),
    });
    expect(await codeOf(controller.refresh(req, res))).toBe('401 refresh_invalid');
    expect(cookie.clear).toHaveBeenCalledWith(res);
    expect(cookie.set).not.toHaveBeenCalled();
  });

  it('refresh for a suspended account keeps 401 account_suspended and clears the cookie (issue #21)', async () => {
    const suspended = new ApiError(HttpStatus.UNAUTHORIZED, 'account_suspended', 'Account is suspended or banned');
    const { controller, cookie, res, req } = build({ refresh: vi.fn(() => Promise.reject(suspended)) });
    expect(await codeOf(controller.refresh(req, res))).toBe('401 account_suspended');
    expect(cookie.clear).toHaveBeenCalledWith(res);
    expect(cookie.set).not.toHaveBeenCalled();
  });

  it('refresh passes other failures through, still clearing the cookie', async () => {
    const boom = new Error('redis down');
    const { controller, cookie, res, req } = build({ refresh: vi.fn(() => Promise.reject(boom)) });
    await expect(controller.refresh(req, res)).rejects.toBe(boom);
    expect(cookie.clear).toHaveBeenCalled();
  });

  it('logout revokes the cookie session and clears the cookie', async () => {
    const { controller, auth, cookie, res, req } = build();
    expect(await controller.logout(req, res)).toEqual({ message: 'Signed out' });
    expect(auth.logout).toHaveBeenCalledWith('rt-old');
    expect(cookie.clear).toHaveBeenCalledWith(res);
  });

  it('logout without a cookie only clears', async () => {
    const { controller, auth, cookie, res, req } = build();
    cookie.read.mockReturnValue(null);
    expect(await controller.logout(req, res)).toEqual({ message: 'Signed out' });
    expect(auth.logout).not.toHaveBeenCalled();
    expect(cookie.clear).toHaveBeenCalledWith(res);
  });
});
