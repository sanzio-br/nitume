import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { OTP_SENDER } from '../src/auth/otp-sender/otp-sender.provider';
import { UserRole, UserStatus } from '../src/common/enums';
import { CustomersService } from '../src/customers/customers.service';
import { RedisService } from '../src/infra/redis/redis.service';
import { TOKEN_CUTOFF_TTL_MARGIN_SECONDS, userTokensValidAfterKey } from '../src/users/token-cutoff.service';
import { userAccessCacheKey } from '../src/users/user-access.service';
import { UsersService } from '../src/users/users.service';
import { TestSocket, connectSocket } from './support/socket-client';
import { withAppendOnlyGuardLifted } from './support/test-database';

/**
 * Issue #24 follow-ups (owner, 2026-10-29): U-1 the admin account summary for
 * the Customer drawer; U-2 the admin errand detail's `customerUserId`; access
 * tokens issued before a suspension or ban stay refused after reactivation
 * (per-user cut-off in Redis, status history as the fallback). Every row is
 * removed in afterAll by tracked id.
 */
describe('Admin user status follow-ups (issue #24, e2e)', () => {
  let app: INestApplication<App>;
  let baseUrl: string;
  let ds: DataSource;
  let redis: RedisService;
  const codes = new Map<string, string>();
  const userIds: string[] = [];
  const errandIds: string[] = [];
  let admin: { id: string; token: string; phone: string };
  const sockets: TestSocket[] = [];

  const randomPhone = (): string => `+2547${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;

  const tokenFor = (user: { id: string; role: UserRole; phone: string }): string =>
    new JwtService().sign(
      { sub: user.id, role: user.role, phone: user.phone, type: 'access' },
      { secret: app.get(ConfigService).get<string>('jwt.accessSecret') as string, expiresIn: '5m' },
    );

  const makeUser = async (role: UserRole = UserRole.CUSTOMER): Promise<{ id: string; token: string; phone: string }> => {
    const user = await app.get(UsersService).create({ phone: randomPhone(), role });
    userIds.push(user.id);
    return { id: user.id, token: tokenFor(user), phone: user.phone };
  };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /** `iat` has whole seconds; a suspension cuts off its whole second. */
  const nextSecond = async (): Promise<void> => {
    const now = Math.floor(Date.now() / 1000);
    while (Math.floor(Date.now() / 1000) <= now) {
      await sleep(20);
    }
  };

  /** A customer signed in through OTP: a real access token. */
  const signIn = async (phone = randomPhone()) => {
    await ds.query('DELETE FROM "otp_codes" WHERE target = $1', [phone]);
    await request(baseUrl).post('/api/v1/auth/otp/request').send({ phone }).expect(201);
    const res = await request(baseUrl)
      .post('/api/v1/auth/otp/verify')
      .send({ phone, code: codes.get(phone) })
      .expect(201);
    const id = res.body.user.id as string;
    if (!userIds.includes(id)) userIds.push(id);
    return { id, phone, accessToken: res.body.tokens.accessToken as string };
  };

  const setStatus = (userId: string, status: UserStatus) =>
    request(baseUrl)
      .patch(`/api/v1/admin/users/${userId}/status`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status, reason: 'Repeated fraud reports from customers' })
      .expect(200);

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

  /** Plain 401 of an access token older than the cut-off: no code. */
  const expectRevoked = async (token: string) => {
    const res = await me(token).expect(401);
    expect(res.body.code).toBeUndefined();
    expect(res.body.message).toBe('Access token revoked, sign in again');
  };
  const expectSocketRefused = async (token: string) => {
    const s = await socketFor(token);
    await waitClosed(s);
    expect(s.closed).toBe(true);
    expect(s.connectError).toBeNull(); // like an invalid token: connected, then dropped
  };
  const expectSocketAccepted = async (token: string) => {
    const s = await socketFor(token);
    await sleep(100);
    expect(s.connectError).toBeNull();
    expect(s.closed).toBe(false);
  };

  const summary = (token: string, userId: string) =>
    request(baseUrl).get(`/api/v1/admin/users/${userId}`).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OTP_SENDER)
      .useValue({
        name: 'capture',
        send: (phone: string, code: string) => {
          codes.set(phone, code);
          return Promise.resolve();
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    ds = app.get(DataSource);
    redis = app.get(RedisService);
    admin = await makeUser(UserRole.ADMIN);
  });

  afterAll(async () => {
    for (const s of sockets) {
      s.close();
    }
    if (errandIds.length > 0) {
      for (const table of ['errand_assignments', 'errand_status_history', 'errand_items', 'errand_locations', 'quotes', 'notification_log', 'notifications']) {
        await ds.query(`DELETE FROM "${table}" WHERE "errandId" = ANY($1)`, [errandIds]);
      }
      await ds.query('DELETE FROM "errands" WHERE id = ANY($1)', [errandIds]);
    }
    if (userIds.length > 0) {
      await redis.del(...userIds.map(userAccessCacheKey), ...userIds.map(userTokensValidAfterKey));
      await withAppendOnlyGuardLifted(ds, 'user_status_history', async (query) => {
        await query('DELETE FROM "user_status_history" WHERE "userId" = ANY($1) OR "actorUserId" = ANY($1)', [userIds]);
      });
      const phones: { phone: string }[] = await ds.query('SELECT phone FROM "users" WHERE id = ANY($1)', [userIds]);
      await ds.query('DELETE FROM "otp_codes" WHERE target = ANY($1)', [phones.map((p) => p.phone)]);
      await ds.query('DELETE FROM "customer_profiles" WHERE "userId" = ANY($1)', [userIds]);
      await ds.query('DELETE FROM "runner_profiles" WHERE "userId" = ANY($1)', [userIds]);
      await ds.query('DELETE FROM "users" WHERE id = ANY($1)', [userIds]);
    }
    await app.close();
  });

  describe('U-1 GET /admin/users/:id', () => {
    it('an admin reads { id, role, status, displayName, phone } of any account', async () => {
      const target = await makeUser(UserRole.RUNNER);
      await ds.query(`UPDATE "users" SET "displayName" = 'Juma K.', status = 'suspended' WHERE id = $1`, [target.id]);
      const res = await summary(admin.token, target.id).expect(200);
      expect(res.body).toEqual({
        id: target.id,
        role: 'runner',
        status: 'suspended',
        displayName: 'Juma K.',
        phone: target.phone,
      });
    });

    it('displayName is null until set', async () => {
      const target = await makeUser();
      const res = await summary(admin.token, target.id).expect(200);
      expect(res.body.displayName).toBeNull();
      expect(res.body.status).toBe('active');
    });

    it.each([UserRole.CUSTOMER, UserRole.RUNNER, UserRole.BUSINESS])('a %s gets 403', async (role) => {
      const caller = await makeUser(role);
      await summary(caller.token, caller.id).expect(403);
    });

    it('no token is 401', async () => {
      await request(baseUrl).get(`/api/v1/admin/users/${admin.id}`).expect(401);
    });

    it('404 user_not_found for an unknown id', async () => {
      const res = await summary(admin.token, '00000000-0000-4000-8000-000000000000').expect(404);
      expect(res.body.code).toBe('user_not_found');
    });

    it('400 for an id that is not a UUID', async () => {
      await summary(admin.token, 'not-a-uuid').expect(400);
    });
  });

  describe('U-2 customerUserId on the admin errand detail', () => {
    const createErrand = async (token: string): Promise<{ id: string; customerId: string }> => {
      const res = await request(baseUrl)
        .post('/api/v1/errands')
        .set('Authorization', `Bearer ${token}`)
        .send({
          category: 'inspection',
          description: 'Check the apartment in Nyali',
          budget: 0,
          locations: [{ pointType: 'task_site', lat: -4.04, lon: 39.7, addressText: 'Links Road, Nyali' }],
        })
        .expect(201);
      errandIds.push(res.body.errand.id as string);
      return res.body.errand as { id: string; customerId: string };
    };

    const makeCustomer = async () => {
      const customer = await makeUser(UserRole.CUSTOMER);
      const profileId = (await app.get(CustomersService).createForUser(customer.id)).id;
      return { ...customer, profileId };
    };

    it("the admin detail carries the owning customer's user id, next to the profile id", async () => {
      const owner = await makeCustomer();
      await makeCustomer(); // another customer, so the id is not just any customer
      const errand = await createErrand(owner.token);
      const res = await request(baseUrl).get(`/api/v1/errands/${errand.id}`).set('Authorization', `Bearer ${admin.token}`).expect(200);
      expect(res.body.customerId).toBe(owner.profileId);
      expect(res.body.customerUserId).toBe(owner.id);
      // ...and it opens the Customer drawer (U-1).
      const summary = await request(baseUrl)
        .get(`/api/v1/admin/users/${res.body.customerUserId as string}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);
      expect(summary.body).toMatchObject({ id: owner.id, role: 'customer', phone: owner.phone });
    });

    it("the customer's own detail does not carry it (admin only, additive)", async () => {
      const owner = await makeCustomer();
      const errand = await createErrand(owner.token);
      const res = await request(baseUrl).get(`/api/v1/errands/${errand.id}`).set('Authorization', `Bearer ${owner.token}`).expect(200);
      expect(res.body).not.toHaveProperty('customerUserId');
    });
  });

  describe('access tokens issued before a suspension or ban stay refused after reactivation', () => {
    it.each([UserStatus.SUSPENDED, UserStatus.BANNED])(
      '%s, then reactivated: the old token is refused on HTTP and Socket.IO; a token from a new sign-in works',
      async (status) => {
        const before = await signIn();
        await me(before.accessToken).expect(200);
        await expectSocketAccepted(before.accessToken);

        await setStatus(before.id, status);
        expect((await me(before.accessToken).expect(401)).body.code).toBe('account_suspended');
        await nextSecond();
        await setStatus(before.id, UserStatus.ACTIVE);

        await expectRevoked(before.accessToken);
        await expectSocketRefused(before.accessToken);

        const after = await signIn(before.phone);
        expect(after.id).toBe(before.id);
        await me(after.accessToken).expect(200);
        await expectSocketAccepted(after.accessToken);
      },
    );

    it('the cut-off lives in Redis for the access-token lifetime plus a margin', async () => {
      const user = await signIn();
      await setStatus(user.id, UserStatus.SUSPENDED);
      const key = userTokensValidAfterKey(user.id);
      expect(Number(await redis.get(key))).toBeGreaterThan(Math.floor(Date.now() / 1000) - 5);
      const ttl = Number(await redis.evalScript("return redis.call('TTL', KEYS[1])", [key], []));
      const accessTtl = 15 * 60; // JWT_ACCESS_TTL default in the test env
      expect(ttl).toBeGreaterThan(accessTtl);
      expect(ttl).toBeLessThanOrEqual(accessTtl + TOKEN_CUTOFF_TTL_MARGIN_SECONDS);
    });

    it('accounts never suspended are unaffected', async () => {
      const user = await signIn();
      await me(user.accessToken).expect(200);
      expect(await redis.get(userTokensValidAfterKey(user.id))).toBeNull();
    });

    it('Redis unreadable: the cut-off is rebuilt from the status history (no fail-open), others keep working', async () => {
      const target = await signIn();
      const bystander = await signIn();
      await setStatus(target.id, UserStatus.SUSPENDED);
      await nextSecond();
      await setStatus(target.id, UserStatus.ACTIVE);
      const after = await signIn(target.phone);

      const realGet = redis.get.bind(redis);
      const spy = vi.spyOn(redis, 'get').mockImplementation((key: string) =>
        key.startsWith('user:tokens-valid-after:') ? Promise.reject(new Error('redis down')) : realGet(key),
      );
      try {
        await expectRevoked(target.accessToken);
        await expectSocketRefused(target.accessToken);
        await me(after.accessToken).expect(200);
        await expectSocketAccepted(after.accessToken);
        await me(bystander.accessToken).expect(200);
        expect(spy).toHaveBeenCalledWith(userTokensValidAfterKey(target.id));
      } finally {
        spy.mockRestore();
      }
    });

    it("the suspension's Redis write lost: reactivation stores the cut-off again", async () => {
      const target = await signIn();
      const realEval = redis.evalScript.bind(redis);
      const spy = vi.spyOn(redis, 'evalScript').mockImplementation((script, keys, args) =>
        keys[0]?.startsWith('user:tokens-valid-after:') ? Promise.reject(new Error('redis down')) : realEval(script, keys, args),
      );
      try {
        await setStatus(target.id, UserStatus.SUSPENDED); // the committed change stands
      } finally {
        spy.mockRestore();
      }
      expect(await redis.get(userTokensValidAfterKey(target.id))).toBeNull();
      await nextSecond();
      await setStatus(target.id, UserStatus.ACTIVE);
      await expectRevoked(target.accessToken);
      await expectSocketRefused(target.accessToken);
    });
  });
});
