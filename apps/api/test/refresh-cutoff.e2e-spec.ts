import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Read by the config factory when the module compiles (before the imports below run it).
const ORIGINAL_WEB_ORIGINS = vi.hoisted(() => {
  const original = process.env.WEB_ORIGINS;
  process.env.WEB_ORIGINS = 'https://web.nitume.test';
  return original;
});

import { AppModule } from '../src/app.module';
import { TokenService } from '../src/auth/token.service';
import { REFRESH_COOKIE_NAME } from '../src/auth/web/refresh-cookie.service';
import { corsOptionsDelegate } from '../src/common/cors';
import { UserRole, UserStatus } from '../src/common/enums';
import { RedisService } from '../src/infra/redis/redis.service';
import { userTokensValidAfterKey } from '../src/users/token-cutoff.service';
import { userAccessCacheKey } from '../src/users/user-access.service';
import { UsersService } from '../src/users/users.service';
import { withAppendOnlyGuardLifted } from './support/test-database';

/**
 * Issue #33 (owner WQ-39, 2026-10-29): `/auth/refresh` (mobile) and
 * `/auth/web/refresh` (website) refuse a refresh session issued before the
 * user's last suspension or ban, even when every #24 revocation (and the
 * Redis cut-off write) was lost, with the response of a revoked token. A
 * session issued after reactivation works; Redis being unreadable never lets
 * an old session through. Sessions come from the app's own `TokenService`
 * (no OTP round trip, so the per-IP OTP budget of the run is untouched).
 */
describe('Refresh refuses sessions issued before a suspension (issue #33, e2e)', () => {
  const WEB_ORIGIN = 'https://web.nitume.test';
  let app: INestApplication<App>;
  let baseUrl: string;
  let ds: DataSource;
  let redis: RedisService;
  let tokens: TokenService;
  const userIds: string[] = [];
  let admin: { id: string; token: string };

  const randomPhone = (): string => `+2547${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /** `iat` has whole seconds; a suspension cuts off its whole second. */
  const nextSecond = async (): Promise<void> => {
    const now = Math.floor(Date.now() / 1000);
    while (Math.floor(Date.now() / 1000) <= now) {
      await sleep(20);
    }
  };

  const makeUser = async (role: UserRole = UserRole.CUSTOMER) => {
    const user = await app.get(UsersService).create({ phone: randomPhone(), role });
    userIds.push(user.id);
    return user;
  };

  /** A customer and a function issuing a live refresh session for it now. */
  const customer = async () => {
    const user = await makeUser();
    return { id: user.id, session: async () => (await tokens.issueTokenPair(user)).refreshToken };
  };

  const http = () => request(baseUrl);
  const web = { Origin: WEB_ORIGIN };

  const setStatus = (userId: string, status: UserStatus) =>
    http()
      .patch(`/api/v1/admin/users/${userId}/status`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status, reason: 'Repeated fraud reports from customers' })
      .expect(200);

  /**
   * Runs `fn` while Redis writes of #24 fail: every refresh-session
   * revocation (`revokeAllForUser` SCAN + DEL) and the cut-off write. The
   * committed status change stands; only the after-commit steps are lost.
   */
  const withRevocationsLost = async (fn: () => Promise<unknown>): Promise<void> => {
    const realEval = redis.evalScript.bind(redis);
    const del = vi.spyOn(redis, 'deleteMatching').mockRejectedValue(new Error('redis down'));
    const evalSpy = vi.spyOn(redis, 'evalScript').mockImplementation((script, keys, args) =>
      keys[0]?.startsWith('user:tokens-valid-after:') ? Promise.reject(new Error('redis down')) : realEval(script, keys, args),
    );
    try {
      await fn();
      expect(del).toHaveBeenCalled();
    } finally {
      del.mockRestore();
      evalSpy.mockRestore();
    }
  };

  /** Suspend or ban, then reactivate, with all four Redis steps lost. */
  const suspendAndReactivateLosingRevocations = async (userId: string, status: UserStatus): Promise<void> => {
    await withRevocationsLost(async () => {
      await setStatus(userId, status);
      await nextSecond();
      await setStatus(userId, UserStatus.ACTIVE);
    });
    // Nothing of #24 reached Redis: no cut-off key.
    expect(await redis.get(userTokensValidAfterKey(userId))).toBeNull();
  };

  const refreshCookie = (res: request.Response): string | undefined => {
    const raw = res.headers['set-cookie'] as string[] | string | undefined;
    const all = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
    return all.find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
  };
  const asCookie = (value: string) => ({ Cookie: `${REFRESH_COOKIE_NAME}=${value}` });

  const mobileRefresh = (refreshToken: string) => http().post('/api/v1/auth/refresh').send({ refreshToken });
  const webRefresh = (token: string) => http().post('/api/v1/auth/web/refresh').set({ ...web, ...asCookie(token) });

  /**
   * The plain 401 of a revoked refresh token (no code), byte for byte the
   * body a second attempt gets once the session row is gone.
   */
  const expectMobileRevoked = async (refreshToken: string) => {
    const res = await mobileRefresh(refreshToken).expect(401);
    expect(res.body.code).toBeUndefined();
    expect(res.body.message).toBe('Refresh token revoked or expired');
    expect((await mobileRefresh(refreshToken).expect(401)).body).toEqual(res.body);
  };
  /** Web: 401 `refresh_invalid` and the cookie cleared, as for a revoked token. */
  const expectWebRevoked = async (token: string) => {
    const res = await webRefresh(token).expect(401);
    expect(res.body.code).toBe('refresh_invalid');
    expect(res.body.message).toBe('Refresh token revoked or expired');
    const cleared = refreshCookie(res);
    expect(cleared).toContain('Expires=Thu, 01 Jan 1970');
    expect(cleared).toContain('Path=/api/v1/auth/web');
    const again = await webRefresh(token).expect(401);
    expect(again.body).toEqual(res.body);
    expect(refreshCookie(again)).toBe(cleared);
  };

  /** The Redis session row of a refresh token (null once revoked). */
  const sessionRow = async (refreshToken: string): Promise<string | null> => {
    const { sub, jti } = new JwtService().decode<{ sub: string; jti: string }>(refreshToken);
    return redis.get(`refresh:${sub}:${jti}`);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    const config = app.get(ConfigService);
    app.enableCors(corsOptionsDelegate(config.get<string[]>('web.origins', [])));
    await app.init();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    ds = app.get(DataSource);
    redis = app.get(RedisService);
    tokens = app.get(TokenService);
    const adminUser = await makeUser(UserRole.ADMIN);
    admin = {
      id: adminUser.id,
      token: new JwtService().sign(
        { sub: adminUser.id, role: adminUser.role, phone: adminUser.phone, type: 'access' },
        { secret: config.get<string>('jwt.accessSecret') as string, expiresIn: '5m' },
      ),
    };
  });

  afterAll(async () => {
    if (userIds.length > 0) {
      for (const id of userIds) {
        await tokens.revokeAllForUser(id);
      }
      await redis.del(...userIds.map(userAccessCacheKey), ...userIds.map(userTokensValidAfterKey));
      await withAppendOnlyGuardLifted(ds, 'user_status_history', async (query) => {
        await query('DELETE FROM "user_status_history" WHERE "userId" = ANY($1) OR "actorUserId" = ANY($1)', [userIds]);
      });
      await ds.query('DELETE FROM "customer_profiles" WHERE "userId" = ANY($1)', [userIds]);
      await ds.query('DELETE FROM "users" WHERE id = ANY($1)', [userIds]);
    }
    await app.close();
    if (ORIGINAL_WEB_ORIGINS === undefined) {
      delete process.env.WEB_ORIGINS;
    } else {
      process.env.WEB_ORIGINS = ORIGINAL_WEB_ORIGINS;
    }
  });

  it.each([UserStatus.SUSPENDED, UserStatus.BANNED])(
    'mobile: %s then reactivated with every revocation lost; the old session is refused and revoked, a new one works',
    async (status) => {
      const user = await customer();
      const old = await user.session();
      await suspendAndReactivateLosingRevocations(user.id, status);
      expect(await sessionRow(old)).not.toBeNull(); // the session survived #24

      await expectMobileRevoked(old);
      expect(await sessionRow(old)).toBeNull(); // revoked, not just refused

      const fresh = await user.session();
      const rotated = await mobileRefresh(fresh).expect(201);
      expect(Object.keys(rotated.body).sort()).toEqual(['accessToken', 'refreshToken']);
      await mobileRefresh(rotated.body.refreshToken as string).expect(201);
    },
  );

  it.each([UserStatus.SUSPENDED, UserStatus.BANNED])(
    'web: %s then reactivated with every revocation lost; refresh_invalid, cookie cleared, a new session works',
    async (status) => {
      const user = await customer();
      const old = await user.session();
      await suspendAndReactivateLosingRevocations(user.id, status);

      await expectWebRevoked(old);
      expect(await sessionRow(old)).toBeNull();

      const fresh = await user.session();
      const res = await webRefresh(fresh).expect(201);
      expect(Object.keys(res.body)).toEqual(['accessToken']);
      expect(refreshCookie(res)).toContain('HttpOnly');
    },
  );

  it('the Redis cut-off present (only the revocations lost): the old session is refused too', async () => {
    const user = await customer();
    const old = await user.session();
    const del = vi.spyOn(redis, 'deleteMatching').mockRejectedValue(new Error('redis down'));
    try {
      await setStatus(user.id, UserStatus.SUSPENDED);
      await nextSecond();
      await setStatus(user.id, UserStatus.ACTIVE);
    } finally {
      del.mockRestore();
    }
    expect(await redis.get(userTokensValidAfterKey(user.id))).not.toBeNull();
    await expectMobileRevoked(old);
    await mobileRefresh(await user.session()).expect(201);
  });

  it('Redis unreadable for the cut-off: rebuilt from the status history, never fails open; others keep working', async () => {
    const target = await customer();
    const bystander = await customer();
    const oldMobile = await target.session();
    const oldWeb = await target.session();
    const bystanderSession = await bystander.session();
    await suspendAndReactivateLosingRevocations(target.id, UserStatus.SUSPENDED);
    const freshMobile = await target.session();
    const freshWeb = await target.session();

    const realGet = redis.get.bind(redis);
    const spy = vi.spyOn(redis, 'get').mockImplementation((key: string) =>
      key.startsWith('user:tokens-valid-after:') ? Promise.reject(new Error('redis down')) : realGet(key),
    );
    try {
      await expectMobileRevoked(oldMobile);
      await expectWebRevoked(oldWeb);
      await mobileRefresh(freshMobile).expect(201);
      await webRefresh(freshWeb).expect(201);
      await mobileRefresh(bystanderSession).expect(201);
      expect(spy).toHaveBeenCalledWith(userTokensValidAfterKey(target.id));
    } finally {
      spy.mockRestore();
    }
  });

  it('accounts never suspended refresh exactly as before on mobile and web', async () => {
    const user = await customer();
    const rotated = await mobileRefresh(await user.session()).expect(201);
    expect(Object.keys(rotated.body).sort()).toEqual(['accessToken', 'refreshToken']);
    const res = await webRefresh(await user.session()).expect(201);
    expect(Object.keys(res.body)).toEqual(['accessToken']);
  });
});
