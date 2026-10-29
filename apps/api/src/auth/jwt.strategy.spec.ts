import { HttpException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { UserRole, UserStatus } from '../common/enums';
import { UserAccess } from '../users/users.service';
import { JwtStrategy } from './jwt.strategy';

const build = (rows: (UserAccess | null)[]) => {
  const access = { accessOf: vi.fn(), isTokenRevoked: vi.fn(() => Promise.resolve(false)) };
  for (const r of rows) {
    access.accessOf.mockResolvedValueOnce(r);
  }
  const config = { get: vi.fn(() => 'secret') };
  return { strategy: new JwtStrategy(config as never, access as never), access };
};

const row = (status: UserStatus): UserAccess => ({ status, role: UserRole.RUNNER, phone: '+254700000002' });
const access = { sub: 'u-1', role: 'runner', phone: '+254700000002', type: 'access' as const };

const bodyOf = async (p: Promise<unknown>): Promise<unknown> => {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(HttpException);
    return { status: (err as HttpException).getStatus(), body: (err as HttpException).getResponse() };
  }
  throw new Error('expected a rejection');
};

describe('JwtStrategy (issue #23: suspended access tokens)', () => {
  it('lets an active account through with role and phone from the account', async () => {
    const { strategy, access: svc } = build([row(UserStatus.ACTIVE)]);
    await expect(strategy.validate(access)).resolves.toEqual({
      userId: 'u-1',
      role: UserRole.RUNNER,
      phone: '+254700000002',
      status: UserStatus.ACTIVE,
    });
    expect(svc.accessOf).toHaveBeenCalledWith('u-1');
  });

  it.each([UserStatus.SUSPENDED, UserStatus.BANNED])(
    'refuses a %s account with 401 account_suspended (same body as OTP verify)',
    async (status) => {
      const { strategy } = build([row(status)]);
      expect(await bodyOf(strategy.validate(access))).toEqual({
        status: 401,
        body: { statusCode: 401, code: 'account_suspended', message: 'Account is suspended or banned' },
      });
    },
  );

  it('with no cut-off for it, lets the token through again once the account is active (issue #24 cut-off below)', async () => {
    const { strategy } = build([row(UserStatus.SUSPENDED), row(UserStatus.ACTIVE)]);
    await expect(strategy.validate(access)).rejects.toThrow();
    await expect(strategy.validate(access)).resolves.toMatchObject({ status: UserStatus.ACTIVE });
  });

  it('answers a missing account with a plain 401 (no account_suspended code)', async () => {
    const { strategy } = build([null]);
    const err = await strategy.validate(access).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnauthorizedException);
    expect(JSON.stringify((err as HttpException).getResponse())).not.toContain('account_suspended');
  });

  it('refuses a refresh token without a status lookup', async () => {
    const { strategy, access: svc } = build([]);
    await expect(strategy.validate({ ...access, type: 'refresh' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(svc.accessOf).not.toHaveBeenCalled();
  });
});

describe('JwtStrategy access-token cut-off (issue #24, owner 2026-10-29)', () => {
  const issued = { ...access, iat: 1_790_000_000 };

  it('refuses a token issued before the last suspension with a plain 401 (no code), once active again', async () => {
    const { strategy, access: svc } = build([row(UserStatus.ACTIVE)]);
    svc.isTokenRevoked.mockResolvedValueOnce(true);
    const err = await strategy.validate(issued).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnauthorizedException);
    const body = (err as UnauthorizedException).getResponse() as Record<string, unknown>;
    expect(body.code).toBeUndefined();
    expect(body.statusCode).toBe(401);
    expect(body.message).toBe('Access token revoked, sign in again');
    expect(svc.isTokenRevoked).toHaveBeenCalledWith('u-1', 1_790_000_000);
  });

  it('a suspended account still gets account_suspended first (cut-off not consulted)', async () => {
    const { strategy, access: svc } = build([row(UserStatus.SUSPENDED)]);
    const out = (await bodyOf(strategy.validate(issued))) as { body: { code: string } };
    expect(out.body.code).toBe('account_suspended');
    expect(svc.isTokenRevoked).not.toHaveBeenCalled();
  });

  it('a token issued after the cut-off passes', async () => {
    const { strategy } = build([row(UserStatus.ACTIVE)]);
    await expect(strategy.validate(issued)).resolves.toMatchObject({ userId: 'u-1' });
  });

  it('a failing cut-off check is an error, never a pass (fail closed)', async () => {
    const { strategy, access: svc } = build([row(UserStatus.ACTIVE)]);
    svc.isTokenRevoked.mockRejectedValueOnce(new Error('redis and db down'));
    await expect(strategy.validate(issued)).rejects.toThrow('redis and db down');
  });
});
