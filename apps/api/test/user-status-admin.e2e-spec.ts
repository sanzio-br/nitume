import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { OTP_SENDER } from '../src/auth/otp-sender/otp-sender.provider';
import { UserRole, UserStatus } from '../src/common/enums';
import { AddUserStatusHistory1790103600000 } from '../src/databases/migrations/1790103600000-AddUserStatusHistory';
import { RedisService } from '../src/infra/redis/redis.service';
import { userTokensValidAfterKey } from '../src/users/token-cutoff.service';
import { userAccessCacheKey } from '../src/users/user-access.service';
import { UsersService } from '../src/users/users.service';
import { TestSocket, connectSocket } from './support/socket-client';
import { assertConnectedToTestDatabase, withAppendOnlyGuardLifted } from './support/test-database';

/**
 * Issue #24 (owner WQ-22 and WQ-23, 2026-10-28): admins suspend, ban and
 * reactivate accounts with a required internal reason; every change is one
 * transaction with its append-only `user_status_history` row, takes effect at
 * once (HTTP 401 `account_suspended`, sockets dropped) and revokes every
 * refresh session, so a reactivated user signs in again with OTP.
 */
describe('Admin user status actions and audit history (issue #24, e2e)', () => {
  let app: INestApplication<App>;
  let baseUrl: string;
  let ds: DataSource;
  let redis: RedisService;
  const codes = new Map<string, string>();
  const userIds: string[] = [];
  const sockets: TestSocket[] = [];
  let admin: { id: string; token: string };

  const REASON = 'Repeated fraud reports from customers';
  const SUSPENDED_BODY = { statusCode: 401, code: 'account_suspended', message: 'Account is suspended or banned' };

  const randomPhone = (): string => `+2547${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const nextSecond = async (): Promise<void> => {
    const now = Math.floor(Date.now() / 1000);
    while (Math.floor(Date.now() / 1000) <= now) {
      await sleep(20);
    }
  };

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

  /** Test-only: forget earlier codes of `phone` so the resend cooldown does not block a new sign-in. */
  const clearOtpLimits = (phone: string) => ds.query('DELETE FROM "otp_codes" WHERE target = $1', [phone]);

  /** A customer signed in through OTP: real access and refresh tokens. */
  const signIn = async (phone = randomPhone()) => {
    await clearOtpLimits(phone);
    await request(baseUrl).post('/api/v1/auth/otp/request').send({ phone }).expect(201);
    const code = codes.get(phone) as string;
    const res = await request(baseUrl).post('/api/v1/auth/otp/verify').send({ phone, code }).expect(201);
    const id = res.body.user.id as string;
    if (!userIds.includes(id)) userIds.push(id);
    return {
      id,
      phone,
      accessToken: res.body.tokens.accessToken as string,
      refreshToken: res.body.tokens.refreshToken as string,
    };
  };

  const patchStatus = (token: string, userId: string, body: Record<string, unknown>) =>
    request(baseUrl).patch(`/api/v1/admin/users/${userId}/status`).set('Authorization', `Bearer ${token}`).send(body);

  const history = (token: string, userId: string, query = '') =>
    request(baseUrl).get(`/api/v1/admin/users/${userId}/status-history${query}`).set('Authorization', `Bearer ${token}`);

  const change = (userId: string, status: UserStatus, expected = 200, reason = REASON) =>
    patchStatus(admin.token, userId, { status, reason }).expect(expected);

  const me = (token: string) => request(baseUrl).get('/api/v1/users/me').set('Authorization', `Bearer ${token}`);
  const refresh = (refreshToken: string) => request(baseUrl).post('/api/v1/auth/refresh').send({ refreshToken });

  const dbStatus = async (id: string): Promise<string> =>
    ((await ds.query('SELECT status::text AS status FROM "users" WHERE id = $1', [id])) as { status: string }[])[0].status;
  const historyRows = (id: string) =>
    ds.query(
      `SELECT "fromStatus"::text AS "fromStatus", "toStatus"::text AS "toStatus", "actorType"::text AS "actorType",
              "actorUserId", reason FROM "user_status_history" WHERE "userId" = $1 ORDER BY "createdAt", id`,
      [id],
    ) as Promise<{ fromStatus: string; toStatus: string; actorType: string; actorUserId: string; reason: string }[]>;
  const cachedStatus = async (id: string): Promise<string | null> => {
    const raw = await redis.get(userAccessCacheKey(id));
    return raw ? (JSON.parse(raw) as { status: string }).status : null;
  };

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

  describe('role guard', () => {
    it.each([UserRole.CUSTOMER, UserRole.RUNNER, UserRole.BUSINESS])(
      'a %s gets 403 on both endpoints and nothing changes',
      async (role) => {
        const caller = await makeUser(role);
        const target = await makeUser();
        await patchStatus(caller.token, target.id, { status: 'suspended', reason: REASON }).expect(403);
        await history(caller.token, target.id).expect(403);
        expect(await dbStatus(target.id)).toBe('active');
        expect(await historyRows(target.id)).toHaveLength(0);
      },
    );

    it('no token is 401', async () => {
      const target = await makeUser();
      await request(baseUrl).patch(`/api/v1/admin/users/${target.id}/status`).send({ status: 'suspended', reason: REASON }).expect(401);
      await request(baseUrl).get(`/api/v1/admin/users/${target.id}/status-history`).expect(401);
    });
  });

  describe('validation and refusals', () => {
    it.each([
      ['missing', {}],
      ['too short', { reason: 'too short' }],
      ['blank padded', { reason: `     ${'x'.repeat(9)}     ` }],
      ['too long', { reason: 'x'.repeat(501) }],
      ['not text', { reason: 12345678901 }],
    ])('reason %s: 400 status_reason_invalid', async (_label, extra) => {
      const target = await makeUser();
      const res = await patchStatus(admin.token, target.id, { status: 'suspended', ...extra }).expect(400);
      expect(res.body).toEqual({
        statusCode: 400,
        code: 'status_reason_invalid',
        message: 'A reason of 10 to 500 characters is required',
        minLength: 10,
        maxLength: 500,
      });
      expect(await dbStatus(target.id)).toBe('active');
    });

    it('accepts a reason of exactly 10 and 500 characters after trimming', async () => {
      const a = await makeUser();
      const b = await makeUser();
      await change(a.id, UserStatus.SUSPENDED, 200, `  ${'r'.repeat(10)}  `);
      await change(b.id, UserStatus.SUSPENDED, 200, 'r'.repeat(500));
      expect((await historyRows(a.id))[0].reason).toBe('r'.repeat(10));
    });

    it('unknown status, extra fields and a non-UUID id are 400', async () => {
      const target = await makeUser();
      await patchStatus(admin.token, target.id, { status: 'deleted', reason: REASON }).expect(400);
      await patchStatus(admin.token, target.id, { status: 'suspended', reason: REASON, extra: 1 }).expect(400);
      await patchStatus(admin.token, 'not-a-uuid', { status: 'suspended', reason: REASON }).expect(400);
      await history(admin.token, 'not-a-uuid').expect(400);
    });

    it('an admin cannot change their own status: 403 cannot_change_own_status', async () => {
      const res = await patchStatus(admin.token, admin.id, { status: 'suspended', reason: REASON }).expect(403);
      expect(res.body.code).toBe('cannot_change_own_status');
      expect(await dbStatus(admin.id)).toBe('active');
    });

    it('an admin cannot change another admin: 403 cannot_change_admin_status', async () => {
      const other = await makeUser(UserRole.ADMIN);
      const res = await patchStatus(admin.token, other.id, { status: 'banned', reason: REASON }).expect(403);
      expect(res.body.code).toBe('cannot_change_admin_status');
      expect(await dbStatus(other.id)).toBe('active');
      expect(await historyRows(other.id)).toHaveLength(0);
    });

    it('an unknown user is 404 user_not_found on both endpoints', async () => {
      const id = randomUUID();
      expect((await change(id, UserStatus.SUSPENDED, 404)).body.code).toBe('user_not_found');
      expect((await history(admin.token, id).expect(404)).body.code).toBe('user_not_found');
    });
  });

  describe('transitions', () => {
    it.each([
      [UserStatus.ACTIVE, UserStatus.SUSPENDED],
      [UserStatus.SUSPENDED, UserStatus.ACTIVE],
      [UserStatus.ACTIVE, UserStatus.BANNED],
      [UserStatus.SUSPENDED, UserStatus.BANNED],
      [UserStatus.BANNED, UserStatus.ACTIVE],
    ])('%s -> %s is allowed and writes one audit row', async (from, to) => {
      const target = await makeUser(UserRole.RUNNER);
      if (from !== UserStatus.ACTIVE) {
        await change(target.id, from);
      }
      const before = (await historyRows(target.id)).length;
      const res = await change(target.id, to);
      expect(res.body.user).toEqual({ id: target.id, role: 'runner', status: to });
      expect(res.body.change).toEqual({
        id: expect.any(String),
        fromStatus: from,
        toStatus: to,
        reason: REASON,
        actorType: 'admin',
        actor: { id: admin.id, displayName: null },
        createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      });
      expect(await dbStatus(target.id)).toBe(to);
      const rows = await historyRows(target.id);
      expect(rows).toHaveLength(before + 1);
      expect(rows[rows.length - 1]).toEqual({ fromStatus: from, toStatus: to, actorType: 'admin', actorUserId: admin.id, reason: REASON });
      expect(await cachedStatus(target.id)).toBe(to);
    });

    it('banned -> suspended is 409 status_transition_not_allowed', async () => {
      const target = await makeUser();
      await change(target.id, UserStatus.BANNED);
      const res = await change(target.id, UserStatus.SUSPENDED, 409);
      expect(res.body).toEqual({
        statusCode: 409,
        code: 'status_transition_not_allowed',
        message: 'A banned account cannot be set to suspended',
        from: 'banned',
        to: 'suspended',
        allowed: ['active'],
      });
      expect(await dbStatus(target.id)).toBe('banned');
      expect(await historyRows(target.id)).toHaveLength(1);
    });

    it.each([UserStatus.ACTIVE, UserStatus.SUSPENDED, UserStatus.BANNED])(
      '%s -> same is 409 status_unchanged with no audit row',
      async (status) => {
        const target = await makeUser();
        if (status !== UserStatus.ACTIVE) await change(target.id, status);
        const before = (await historyRows(target.id)).length;
        const res = await change(target.id, status, 409);
        expect(res.body).toMatchObject({ code: 'status_unchanged', status });
        expect(await historyRows(target.id)).toHaveLength(before);
      },
    );

    it('concurrent changes of one user are serialised: history chains and the cache matches the database', async () => {
      const target = await makeUser();
      const results = await Promise.all([
        patchStatus(admin.token, target.id, { status: 'suspended', reason: REASON }),
        patchStatus(admin.token, target.id, { status: 'banned', reason: REASON }),
        patchStatus(admin.token, target.id, { status: 'active', reason: REASON }),
      ]);
      const ok = results.filter((r) => r.status === 200).length;
      expect(results.every((r) => r.status === 200 || r.status === 409)).toBe(true);
      const rows = await historyRows(target.id);
      expect(rows).toHaveLength(ok);
      let prev = 'active';
      for (const row of rows) {
        expect(row.fromStatus).toBe(prev);
        prev = row.toStatus;
      }
      expect(await dbStatus(target.id)).toBe(prev);
      expect(await cachedStatus(target.id)).toBe(prev);
    });
  });

  describe('atomic audit and append-only history', () => {
    it('a failure while writing the audit row leaves neither the status nor a row changed', async () => {
      const target = await makeUser();
      await me(target.token).expect(200); // cached active
      await assertConnectedToTestDatabase((sql, params) => ds.query(sql, params));
      await ds.query(
        `CREATE FUNCTION "e2e_fail_user_status_history"() RETURNS trigger LANGUAGE plpgsql AS $$
         BEGIN
           IF NEW.reason LIKE 'E2E forced failure%' THEN RAISE EXCEPTION 'forced failure'; END IF;
           RETURN NEW;
         END; $$`,
      );
      try {
        await ds.query(
          `CREATE TRIGGER "e2e_fail_user_status_history" BEFORE INSERT ON "user_status_history" FOR EACH ROW EXECUTE FUNCTION "e2e_fail_user_status_history"()`,
        );
        await change(target.id, UserStatus.SUSPENDED, 500, 'E2E forced failure of the audit insert');
      } finally {
        await ds.query('DROP TRIGGER IF EXISTS "e2e_fail_user_status_history" ON "user_status_history"');
        await ds.query('DROP FUNCTION IF EXISTS "e2e_fail_user_status_history"()');
      }
      expect(await dbStatus(target.id)).toBe('active');
      expect(await historyRows(target.id)).toHaveLength(0);
      expect(await cachedStatus(target.id)).toBe('active');
      await me(target.token).expect(200);
      // And the same change succeeds afterwards.
      await change(target.id, UserStatus.SUSPENDED);
      expect(await historyRows(target.id)).toHaveLength(1);
    });

    it('UPDATE, DELETE and TRUNCATE of the history are rejected', async () => {
      const target = await makeUser();
      await change(target.id, UserStatus.SUSPENDED);
      await expect(ds.query(`UPDATE "user_status_history" SET reason = 'rewritten later' WHERE "userId" = $1`, [target.id])).rejects.toThrow(
        /append-only/,
      );
      await expect(ds.query('DELETE FROM "user_status_history" WHERE "userId" = $1', [target.id])).rejects.toThrow(/append-only/);
      await expect(ds.query('TRUNCATE "user_status_history"')).rejects.toThrow(/append-only/);
      expect(await historyRows(target.id)).toHaveLength(1);
    });

    it('the CHECKs refuse a no-op row and an admin row without an actor; a user with history cannot be deleted', async () => {
      const target = await makeUser();
      const insert = (from: string, to: string, actorType: string, actor: string | null) =>
        ds.query(
          `INSERT INTO "user_status_history" ("userId", "fromStatus", "toStatus", "actorType", "actorUserId", reason)
           VALUES ($1, $2, $3, $4, $5, 'Inserted by the e2e test')`,
          [target.id, from, to, actorType, actor],
        );
      await expect(insert('active', 'active', 'admin', admin.id)).rejects.toThrow(/CHK_user_status_history_changed/);
      await expect(insert('active', 'suspended', 'admin', null)).rejects.toThrow(/CHK_user_status_history_actor/);
      await change(target.id, UserStatus.SUSPENDED);
      await expect(ds.query('DELETE FROM "users" WHERE id = $1', [target.id])).rejects.toThrow(/FK_user_status_history_user/);
    });
  });

  describe('immediate effect', () => {
    it.each([UserStatus.SUSPENDED, UserStatus.BANNED])(
      '%s: the access token gets 401 account_suspended and live sockets are dropped at once',
      async (status) => {
        const target = await makeUser();
        const bystander = await makeUser();
        await me(target.token).expect(200);
        const a = await socketFor(target.token);
        const b = await socketFor(bystander.token);
        expect([a.closed, b.closed]).toEqual([false, false]);

        await change(target.id, status);
        expect((await me(target.token).expect(401)).body).toEqual(SUSPENDED_BODY);
        await waitClosed(a);
        expect(a.closed).toBe(true);
        await sleep(100);
        expect(b.closed).toBe(false);
        expect((await socketFor(target.token)).connectError?.message).toBe('account_suspended');
      },
    );

    it('the reason is never shown to the user: the body is the generic account_suspended one', async () => {
      const target = await makeUser();
      await change(target.id, UserStatus.SUSPENDED, 200, 'Internal note: chargeback fraud ring');
      const res = await me(target.token).expect(401);
      expect(JSON.stringify(res.body)).not.toContain('chargeback');
    });
  });

  describe('refresh sessions (owner WQ-23)', () => {
    it.each([UserStatus.SUSPENDED, UserStatus.BANNED])(
      '%s revokes every refresh session; after reactivation they stay dead and a fresh OTP sign-in works',
      async (status) => {
        const first = await signIn();
        const second = await signIn(first.phone); // a second device
        await change(first.id, status);
        // A live session of a suspended account would answer account_suspended;
        // a revoked one is refused before the status check, with no code.
        const whileSuspended = await refresh(second.refreshToken).expect(401);
        expect(whileSuspended.body.code).toBeUndefined();
        expect(whileSuspended.body.message).toBe('Refresh token revoked or expired');

        // Issue #24 cut-off: the suspension refuses access tokens of its whole
        // second, so the fresh sign-in below must come in a later one.
        await nextSecond();
        await change(first.id, UserStatus.ACTIVE, 200, 'Appeal accepted after review');
        for (const old of [first.refreshToken, second.refreshToken]) {
          const res = await refresh(old).expect(401);
          expect(res.body.message).toBe('Refresh token revoked or expired');
        }
        const fresh = await signIn(first.phone);
        expect(fresh.id).toBe(first.id);
        await me(fresh.accessToken).expect(200);
        await refresh(fresh.refreshToken).expect(201);
      },
    );

    it('only the target user loses sessions', async () => {
      const target = await signIn();
      const other = await signIn();
      await change(target.id, UserStatus.SUSPENDED);
      await refresh(other.refreshToken).expect(201);
    });

    it('a suspended user cannot refresh or sign in again until reactivated', async () => {
      const target = await signIn();
      await change(target.id, UserStatus.SUSPENDED);
      await refresh(target.refreshToken).expect(401);
      await clearOtpLimits(target.phone);
      await request(baseUrl).post('/api/v1/auth/otp/request').send({ phone: target.phone }).expect(201);
      const res = await request(baseUrl)
        .post('/api/v1/auth/otp/verify')
        .send({ phone: target.phone, code: codes.get(target.phone) })
        .expect(401);
      expect(res.body.code).toBe('account_suspended');
    });
  });

  describe('history', () => {
    it('pages newest first with a cursor, without gaps or repeats, and is admin-only data', async () => {
      const target = await makeUser();
      const sequence = [
        UserStatus.SUSPENDED,
        UserStatus.ACTIVE,
        UserStatus.SUSPENDED,
        UserStatus.BANNED,
        UserStatus.ACTIVE,
      ];
      for (const [i, status] of sequence.entries()) {
        await change(target.id, status, 200, `Change number ${i + 1} by ops`);
      }
      const seen: { id: string; reason: string; createdAt: string }[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const query: string = cursor ? `?limit=2&cursor=${encodeURIComponent(cursor)}` : '?limit=2';
        const res = await history(admin.token, target.id, query).expect(200);
        expect(res.body.items.length).toBeLessThanOrEqual(2);
        seen.push(...res.body.items);
        cursor = res.body.nextCursor;
        pages += 1;
      } while (cursor);
      expect(pages).toBe(3);
      expect(seen.map((i) => i.reason)).toEqual([5, 4, 3, 2, 1].map((n) => `Change number ${n} by ops`));
      expect(new Set(seen.map((i) => i.id)).size).toBe(5);
      const first = (await history(admin.token, target.id).expect(200)).body;
      expect(first.items).toHaveLength(5);
      expect(first.nextCursor).toBeNull();
      expect(first.items[0]).toEqual({
        id: expect.any(String),
        fromStatus: 'banned',
        toStatus: 'active',
        reason: 'Change number 5 by ops',
        actorType: 'admin',
        actor: { id: admin.id, displayName: null },
        createdAt: expect.any(String),
      });
    });

    it('defaults to 20 and caps at 50; an empty history is an empty page', async () => {
      const target = await makeUser();
      expect((await history(admin.token, target.id).expect(200)).body).toEqual({ items: [], nextCursor: null });
      await history(admin.token, target.id, '?limit=50').expect(200);
      await history(admin.token, target.id, '?limit=51').expect(400);
      await history(admin.token, target.id, '?limit=0').expect(400);
    });

    it("refuses an unreadable cursor or another user's cursor: 400 cursor_invalid", async () => {
      const a = await makeUser();
      const b = await makeUser();
      for (const s of [UserStatus.SUSPENDED, UserStatus.ACTIVE]) {
        await change(a.id, s);
      }
      const page = (await history(admin.token, a.id, '?limit=1').expect(200)).body;
      expect(page.nextCursor).toEqual(expect.any(String));
      expect((await history(admin.token, b.id, `?cursor=${page.nextCursor}`).expect(400)).body.code).toBe('cursor_invalid');
      expect((await history(admin.token, a.id, '?cursor=garbage').expect(400)).body.code).toBe('cursor_invalid');
    });
  });

  describe('versioned cache write (Redis Lua)', () => {
    it('keeps a newer version and replaces an older or unversioned one', async () => {
      const key = `e2e:set-if-not-older:${randomUUID()}`;
      try {
        expect(await redis.setIfNotOlder(key, JSON.stringify({ status: 'active', v: 10 }), 10, 60)).toBe(true);
        expect(await redis.setIfNotOlder(key, JSON.stringify({ status: 'suspended', v: 9 }), 9, 60)).toBe(false);
        expect(JSON.parse((await redis.get(key)) as string).status).toBe('active');
        expect(await redis.setIfNotOlder(key, JSON.stringify({ status: 'banned', v: 11 }), 11, 60)).toBe(true);
        await redis.set(key, JSON.stringify({ status: 'active' }), 60); // a reader's unversioned fill
        expect(await redis.setIfNotOlder(key, JSON.stringify({ status: 'banned', v: 1 }), 1, 60)).toBe(true);
      } finally {
        await redis.del(key);
      }
    });
  });

  describe('migration 1790103600000', () => {
    it('down drops the table, function and triggers; up restores columns, CHECKs, indexes, FKs and triggers', async () => {
      const runner = ds.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      try {
        await assertConnectedToTestDatabase((sql, params) => runner.query(sql, params));
        const migration = new AddUserStatusHistory1790103600000();
        await migration.down(runner);
        const gone = await runner.query(
          `SELECT to_regclass('public.user_status_history') AS t,
                  (SELECT count(*)::int FROM pg_proc WHERE proname = 'user_status_history_append_only') AS f`,
        );
        expect(gone).toEqual([{ t: null, f: 0 }]);

        await migration.up(runner);
        const constraints: { conname: string }[] = await runner.query(
          `SELECT conname FROM pg_constraint
            WHERE conrelid = 'public.user_status_history'::regclass AND contype IN ('c', 'f', 'p') ORDER BY conname`,
        );
        expect(constraints.map((c) => c.conname)).toEqual([
          'CHK_user_status_history_actor',
          'CHK_user_status_history_changed',
          'FK_user_status_history_actor',
          'FK_user_status_history_user',
          'PK_user_status_history',
        ]);
        const indexes: { indexdef: string }[] = await runner.query(
          `SELECT indexdef FROM pg_indexes WHERE tablename = 'user_status_history' AND indexname LIKE 'IDX_%' ORDER BY indexname`,
        );
        expect(indexes.map((i) => i.indexdef.replace(/^.* USING btree /, ''))).toEqual([
          '("actorUserId", "createdAt")',
          '("userId", "createdAt" DESC)',
        ]);
        const triggers: { tgname: string }[] = await runner.query(
          `SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.user_status_history'::regclass AND NOT tgisinternal ORDER BY tgname`,
        );
        expect(triggers.map((t) => t.tgname)).toEqual([
          'TRG_user_status_history_append_only',
          'TRG_user_status_history_no_truncate',
        ]);
        const fks: { conname: string; confdeltype: string }[] = await runner.query(
          `SELECT conname, confdeltype FROM pg_constraint WHERE conrelid = 'public.user_status_history'::regclass AND contype = 'f'`,
        );
        expect(fks.every((fk) => fk.confdeltype === 'r')).toBe(true); // ON DELETE RESTRICT
      } finally {
        await runner.rollbackTransaction();
        await runner.release();
      }
      // The real table is untouched.
      expect((await ds.query(`SELECT to_regclass('public.user_status_history') AS t`))[0].t).toBe('user_status_history');
    });
  });
});
