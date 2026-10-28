import { HttpException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { UserRole, UserStatus } from '../common/enums';
import { UserAccess } from '../users/users.service';
import { JwtStrategy } from './jwt.strategy';

const build = (rows: (UserAccess | null)[]) => {
  const access = { accessOf: vi.fn() };
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

  it('lets the same token through again once the account is reactivated', async () => {
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
