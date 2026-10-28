import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { UserRole, UserStatus } from '../src/common/enums';
import { CustomersService } from '../src/customers/customers.service';
import { RedisService } from '../src/infra/redis/redis.service';
import { RunnersService } from '../src/runners/runners.service';
import { UserAccessService, userAccessCacheKey } from '../src/users/user-access.service';
import { UsersService } from '../src/users/users.service';
import { TestSocket, connectSocket } from './support/socket-client';

/**
 * Issue #23 (owner WQ-20, 2026-10-28): an access token issued before a
 * suspension stops working at once on every authenticated HTTP route and on
 * Socket.IO. The body is the OTP verify / refresh one. Status changes go
 * through `UserAccessService.setStatus`, which refreshes the Redis cache
 * and disconnects live sockets; the cache TTL is only the fallback for
 * changes made outside the API.
 */
describe('Suspended accounts lose access-token access (issue #23, e2e)', () => {
  let app: INestApplication<App>;
  let baseUrl: string;
  let ds: DataSource;
  let access: UserAccessService;
  const userIds: string[] = [];
  const sockets: TestSocket[] = [];

  const SUSPENDED_BODY = {
    statusCode: 401,
    code: 'account_suspended',
    message: 'Account is suspended or banned',
  };

  const randomPhone = (): string => `+2547${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const makeUser = async (role: UserRole = UserRole.CUSTOMER): Promise<{ id: string; token: string }> => {
    const user = await app.get(UsersService).create({ phone: randomPhone(), role });
    userIds.push(user.id);
    if (role === UserRole.RUNNER) {
      await app.get(RunnersService).createForUser(user.id);
    } else {
      await app.get(CustomersService).createForUser(user.id);
    }
    const token = new JwtService().sign(
      { sub: user.id, role: user.role, phone: user.phone, type: 'access' },
      { secret: app.get(ConfigService).get<string>('jwt.accessSecret') as string, expiresIn: '5m' },
    );
    return { id: user.id, token };
  };

  const me = (token: string) => request(baseUrl).get('/api/v1/users/me').set('Authorization', `Bearer ${token}`);

  const socketFor = async (token: string): Promise<TestSocket> => {
    const s = await connectSocket(baseUrl, token);
    sockets.push(s);
    return s;
  };

  const waitClosed = async (s: TestSocket, timeoutMs = 3000): Promise<void> => {
    const until = Date.now() + timeoutMs;
    while (!s.closed && Date.now() < until) {
      await sleep(25);
    }
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    ds = app.get(DataSource);
    access = app.get(UserAccessService);
  });

  afterAll(async () => {
    for (const s of sockets) {
      s.close();
    }
    if (userIds.length > 0) {
      await app.get(RedisService).del(...userIds.map(userAccessCacheKey));
      await ds.query('DELETE FROM "customer_profiles" WHERE "userId" = ANY($1)', [userIds]);
      await ds.query('DELETE FROM "runner_profiles" WHERE "userId" = ANY($1)', [userIds]);
      await ds.query('DELETE FROM "users" WHERE id = ANY($1)', [userIds]);
    }
    await app.close();
  });

  describe('HTTP guard', () => {
    it('active accounts are unaffected', async () => {
      const { id, token } = await makeUser();
      const res = await me(token).expect(200);
      expect(res.body.id).toBe(id);
    });

    it.each([UserStatus.SUSPENDED, UserStatus.BANNED])(
      'a still-valid token of a %s account gets 401 account_suspended at once, even when cached active',
      async (status) => {
        const { id, token } = await makeUser(UserRole.RUNNER);
        await me(token).expect(200); // the active status is now cached
        await access.setStatus(id, status);
        const res = await me(token).expect(401);
        expect(res.body).toEqual(SUSPENDED_BODY);
      },
    );

    it('reactivating restores the same token at once', async () => {
      const { id, token } = await makeUser();
      await access.setStatus(id, UserStatus.SUSPENDED);
      await me(token).expect(401);
      await access.setStatus(id, UserStatus.ACTIVE);
      await me(token).expect(200);
    });

    it('public routes still answer a suspended token', async () => {
      const { id, token } = await makeUser();
      await access.setStatus(id, UserStatus.SUSPENDED);
      await request(baseUrl).get('/api/v1/health').set('Authorization', `Bearer ${token}`).expect(200);
    });

    it('a change made outside the API (SQL) applies once the cached entry lapses (TTL fallback)', async () => {
      const { id, token } = await makeUser();
      await me(token).expect(200);
      await ds.query('UPDATE "users" SET status = $1 WHERE id = $2', [UserStatus.SUSPENDED, id]);
      // Still cached as active until the TTL; simulate its expiry.
      await me(token).expect(200);
      await app.get(RedisService).del(userAccessCacheKey(id));
      const res = await me(token).expect(401);
      expect(res.body).toEqual(SUSPENDED_BODY);
    });
  });

  describe('Socket.IO', () => {
    it('refuses the handshake of a suspended account with connect_error account_suspended', async () => {
      const { id, token } = await makeUser();
      await access.setStatus(id, UserStatus.SUSPENDED);
      const s = await socketFor(token);
      expect(s.closed).toBe(true);
      expect(s.connectError).toEqual({ message: 'account_suspended', data: SUSPENDED_BODY });
    });

    it('suspending disconnects every live socket of the user and leaves others connected', async () => {
      const target = await makeUser();
      const other = await makeUser();
      const a = await socketFor(target.token);
      const b = await socketFor(target.token);
      const bystander = await socketFor(other.token);
      expect([a.closed, b.closed, bystander.closed]).toEqual([false, false, false]);

      await access.setStatus(target.id, UserStatus.BANNED);
      await waitClosed(a);
      await waitClosed(b);
      expect([a.closed, b.closed]).toEqual([true, true]);
      await sleep(100);
      expect(bystander.closed).toBe(false);

      // The client's reconnect is refused at the handshake.
      const retry = await socketFor(target.token);
      expect(retry.connectError?.message).toBe('account_suspended');
    });

    it('a reactivated account connects again', async () => {
      const { id, token } = await makeUser();
      await access.setStatus(id, UserStatus.SUSPENDED);
      expect((await socketFor(token)).connectError?.message).toBe('account_suspended');
      await access.setStatus(id, UserStatus.ACTIVE);
      const s = await socketFor(token);
      expect(s.connectError).toBeNull();
      expect(s.closed).toBe(false);
    });
  });
});
