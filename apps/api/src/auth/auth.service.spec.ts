import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../common/api-error';
import { UserRole, UserStatus } from '../common/enums';
import { AuthService } from './auth.service';

const build = (user: object | null) => {
  const users = {
    findByPhone: vi.fn(() => Promise.resolve(user)),
    findByEmail: vi.fn(() => Promise.resolve(user)),
  };
  const otp = { verifyCode: vi.fn(() => Promise.resolve()), verifyEmailCode: vi.fn(() => Promise.resolve()) };
  const tokens = { issueTokenPair: vi.fn(() => Promise.resolve({ accessToken: 'a', refreshToken: 'r' })) };
  const service = new AuthService(
    users as never,
    {} as never,
    {} as never,
    otp as never,
    tokens as never,
    {} as never,
  );
  return { service, tokens };
};

const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => (e instanceof ApiError ? `${e.getStatus()} ${e.code}` : String(e)),
  );

describe('AuthService suspended accounts', () => {
  it('answers phone OTP verify with 401 account_suspended', async () => {
    const { service, tokens } = build({ id: 'u-1', role: UserRole.CUSTOMER, status: UserStatus.SUSPENDED });
    expect(await codeOf(service.verifyOtpAndLogin({ phone: '0712345678', code: '123456' }))).toBe(
      '401 account_suspended',
    );
    expect(tokens.issueTokenPair).not.toHaveBeenCalled();
  });

  it('answers admin email OTP verify for a banned admin the same way', async () => {
    const { service } = build({ id: 'a-1', role: UserRole.ADMIN, status: UserStatus.BANNED });
    expect(await codeOf(service.verifyEmailOtpAndLogin({ email: 'a@b.co', code: '123456' }))).toBe(
      '401 account_suspended',
    );
  });
});

describe('AuthService runner OTP sign-in (row 217)', () => {
  const buildWith = (user: object) => {
    const runners = { ensurePhoneVerified: vi.fn(() => Promise.resolve()) };
    const service = new AuthService(
      { findByPhone: vi.fn(() => Promise.resolve(user)) } as never,
      {} as never,
      runners as never,
      { verifyCode: vi.fn(() => Promise.resolve()) } as never,
      { issueTokenPair: vi.fn(() => Promise.resolve({ accessToken: 'a', refreshToken: 'r' })) } as never,
      {} as never,
    );
    return { service, runners };
  };

  it('records the phone check approved for a runner, and not for a customer', async () => {
    const runner = buildWith({ id: 'u-r', role: UserRole.RUNNER, status: UserStatus.ACTIVE });
    await runner.service.verifyOtpAndLogin({ phone: '0712345678', code: '123456' });
    expect(runner.runners.ensurePhoneVerified).toHaveBeenCalledWith('u-r');
    const customer = buildWith({ id: 'u-c', role: UserRole.CUSTOMER, status: UserStatus.ACTIVE });
    await customer.service.verifyOtpAndLogin({ phone: '0712345678', code: '123456' });
    expect(customer.runners.ensurePhoneVerified).not.toHaveBeenCalled();
  });
});

describe('AuthService.refresh account status (issue #21)', () => {
  const buildRefresh = (status: UserStatus | null) => {
    const users = { statusOf: vi.fn(() => Promise.resolve(status)) };
    const tokens = {
      verifyRefresh: vi.fn(() => Promise.resolve({ sub: 'u-1', role: 'customer', phone: '+254700000000', type: 'refresh', jti: 'j-1' })),
      rotate: vi.fn(() => Promise.resolve({ accessToken: 'a2', refreshToken: 'r2' })),
      revoke: vi.fn(() => Promise.resolve()),
    };
    const service = new AuthService(users as never, {} as never, {} as never, {} as never, tokens as never, {} as never);
    return { service, users, tokens };
  };

  it('rotates exactly as before for an active account', async () => {
    const { service, users, tokens } = buildRefresh(UserStatus.ACTIVE);
    expect(await service.refresh('rt')).toEqual({ accessToken: 'a2', refreshToken: 'r2' });
    expect(users.statusOf).toHaveBeenCalledWith('u-1');
    expect(tokens.rotate).toHaveBeenCalledWith('rt');
    expect(tokens.revoke).not.toHaveBeenCalled();
  });

  it.each([UserStatus.SUSPENDED, UserStatus.BANNED])(
    'revokes the session and answers 401 account_suspended for a %s account',
    async (status) => {
      const { service, tokens } = buildRefresh(status);
      expect(await codeOf(service.refresh('rt'))).toBe('401 account_suspended');
      expect(tokens.revoke).toHaveBeenCalledWith('rt');
      expect(tokens.rotate).not.toHaveBeenCalled();
    },
  );

  it('revokes and refuses a session whose user no longer exists', async () => {
    const { service, tokens } = buildRefresh(null);
    await expect(service.refresh('rt')).rejects.toThrow('Invalid refresh token');
    expect(tokens.revoke).toHaveBeenCalledWith('rt');
    expect(tokens.rotate).not.toHaveBeenCalled();
  });

  it('does not look up the account when the token itself is invalid', async () => {
    const { service, users, tokens } = buildRefresh(UserStatus.ACTIVE);
    tokens.verifyRefresh.mockImplementationOnce(() => Promise.reject(new Error('Refresh token revoked or expired')));
    await expect(service.refresh('rt')).rejects.toThrow('Refresh token revoked or expired');
    expect(users.statusOf).not.toHaveBeenCalled();
    expect(tokens.rotate).not.toHaveBeenCalled();
  });
});
