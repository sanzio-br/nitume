import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { Queue } from 'bullmq';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { UserRole } from '../src/common/enums';
import { CustomersService } from '../src/customers/customers.service';
import { MAINTENANCE_QUEUE } from '../src/infra/queue/queues';
import { RedisService } from '../src/infra/redis/redis.service';
import { runnerPresenceKey } from '../src/runners/runner-presence.service';
import { RunnersService } from '../src/runners/runners.service';
import { WEB_PRESENCE_SWEEP_JOB } from '../src/scheduler/maintenance.processor';
import { WebPresenceSweepService } from '../src/scheduler/web-presence-sweep.service';
import { UsersService } from '../src/users/users.service';
import { deleteRunnerVerifications, readyRunner } from './support/runner-fixtures';
import { TestSocket, connectSocket } from './support/socket-client';

/**
 * Issue #36 (owner Q14-5, Q14-6, Q14-7, 2026-10-29): web runner presence.
 * The handshake `auth.client` marks a web socket; every accepted ping writes
 * the Redis presence record; the maintenance sweep (BullMQ) flags web
 * runners whose pings stopped (`runner:web_pings_stopped` to admins, once)
 * and sets idle online web runners offline (`runner:web_auto_offline`)
 * through the availability path, so the candidates read lists them as
 * offline. Busy runners and runners with an open offer are flagged only;
 * app runners are never touched. Time is simulated by moving the presence
 * record's times back in Redis. Every row created here is removed in
 * afterAll by tracked id; no append-only table is written.
 */
describe('Web runner presence (e2e, issue #36)', () => {
  let app: INestApplication<App>;
  let baseUrl: string;
  const userIds: string[] = [];
  const errandIds: string[] = [];
  const sockets: TestSocket[] = [];
  const AREA = 'wp36-area';
  const SITE = { lat: -3.21, lng: 40.11 };

  const MIN_INTERVAL_MS = 300;
  process.env.LOCATION_PING_MIN_INTERVAL_MS = String(MIN_INTERVAL_MS);

  const randomPhone = (): string => `+2547${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  type Actor = { id: string; token: string; profileId: string | null };

  const tokenFor = (user: { id: string; role: UserRole; phone: string }): string =>
    new JwtService().sign(
      { sub: user.id, role: user.role, phone: user.phone, type: 'access' },
      { secret: app.get(ConfigService).get<string>('jwt.accessSecret') as string, expiresIn: '5m' },
    );

  const http = () => request(baseUrl);
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const db = () => app.get(DataSource);
  const redis = () => app.get(RedisService);

  const makeUser = async (role: UserRole): Promise<Actor> => {
    const user = await app.get(UsersService).create({ phone: randomPhone(), role });
    userIds.push(user.id);
    let profileId: string | null = null;
    if (role === UserRole.CUSTOMER) {
      profileId = (await app.get(CustomersService).createForUser(user.id)).id;
    } else if (role === UserRole.RUNNER) {
      profileId = (await app.get(RunnersService).createForUser(user.id)).id;
      await readyRunner(db(), profileId);
    }
    return { id: user.id, token: tokenFor(user), profileId };
  };

  /** A ready, online runner in the test area with the inspection skill (the candidates pool). */
  const poolRunner = async (): Promise<Actor> => {
    const runner = await makeUser(UserRole.RUNNER);
    await http().put('/api/v1/runners/me/skills').set(bearer(runner.token)).send({ skills: ['inspection'] }).expect(200);
    await http().put('/api/v1/runners/me/service-areas').set(bearer(runner.token)).send({ areas: [AREA] }).expect(200);
    return runner;
  };

  const socketFor = async (actor: Actor, client?: string): Promise<TestSocket> => {
    const s = await connectSocket(baseUrl, actor.token, 150, client === undefined ? {} : { client });
    sockets.push(s);
    return s;
  };

  const ping = async (s: TestSocket, body: Record<string, unknown> = { lat: SITE.lat, lng: SITE.lng }) => {
    for (let attempt = 0; ; attempt += 1) {
      const ack = await s.emitWithAck<{ ok: boolean; error?: string }>('location:ping', body);
      if (ack.error !== 'rate_limited' || attempt >= 40) {
        return ack;
      }
      await sleep(MIN_INTERVAL_MS / 3);
    }
  };

  const presenceHash = async (runner: Actor): Promise<Record<string, string>> =>
    (await redis().hgetallMany([runnerPresenceKey(runner.profileId as string)]))[0];

  /** Simulated time: moves every clock field of the record `seconds` into the past. */
  const age = (runner: Actor, seconds: number) =>
    redis().evalScript(
      `for _, f in ipairs({'lastPingAt', 'connectedAt', 'onlineAt'}) do
         if redis.call('HEXISTS', KEYS[1], f) == 1 then redis.call('HSET', KEYS[1], f, ARGV[1]) end
       end
       return 1`,
      [runnerPresenceKey(runner.profileId as string)],
      [String(Date.now() - seconds * 1000)],
    );

  const sweep = () => app.get(WebPresenceSweepService).sweep();

  const adminRow = async (admin: Actor, runner: Actor) => {
    let cursor: string | null = null;
    do {
      const page = await http()
        .get('/api/v1/runners')
        .query({ limit: 100, ...(cursor ? { cursor } : {}) })
        .set(bearer(admin.token))
        .expect(200);
      const hit = (page.body.items as { id: string }[]).find((r) => r.id === runner.profileId);
      if (hit) {
        return hit as unknown as { presence: Record<string, unknown>; availability: string };
      }
      cursor = page.body.nextCursor as string | null;
    } while (cursor);
    throw new Error('runner not in GET /runners');
  };

  const availabilityOf = async (runner: Actor): Promise<string> =>
    (await http().get('/api/v1/runners/me').set(bearer(runner.token)).expect(200)).body.availability as string;

  const events = (s: TestSocket, event: string, runner: Actor) =>
    s.received.filter((r) => r.event === event && (r.data as { runnerProfileId?: string }).runnerProfileId === runner.profileId);

  const paidErrand = async (customer: Actor, admin: Actor) => {
    const created = await http()
      .post('/api/v1/errands')
      .set(bearer(customer.token))
      .send({
        category: 'inspection',
        description: 'Check the shop in Malindi',
        budget: 0,
        locations: [{ pointType: 'task_site', lat: SITE.lat, lon: SITE.lng, addressText: 'Lamu Road, Malindi' }],
      })
      .expect(201);
    const id = created.body.errand.id as string;
    errandIds.push(id);
    await http().post(`/api/v1/errands/${id}/submit`).set(bearer(customer.token)).expect(201);
    await http().post(`/api/v1/errands/${id}/quote`).set(bearer(admin.token)).send({ total: 1000, baseFee: 600, distanceFee: 400 }).expect(201);
    await http().patch(`/api/v1/errands/${id}/status`).set(bearer(customer.token)).send({ to: 'ACCEPTED' }).expect(200);
    const init = await http().post(`/api/v1/payments/${id}/initiate`).set(bearer(customer.token)).send({}).expect(201);
    await http().post('/api/v1/payments/mpesa/callback').send({ reference: init.body.reference, resultCode: 0 }).expect(201);
    return id;
  };

  const assign = (admin: Actor, errandId: string, runner: Actor) =>
    http().post(`/api/v1/errands/${errandId}/assign`).set(bearer(admin.token)).send({ runnerProfileId: runner.profileId }).expect(201);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    // One service area of our own, so the candidates read holds only this file's runners.
    const config = app.get(ConfigService);
    const original = config.get.bind(config);
    vi.spyOn(config, 'get').mockImplementation(((key: string, def?: unknown) =>
      key === 'runners.serviceAreas' ? [{ id: AREA, name: 'WP36', ...SITE, radiusKm: 1 }] : original(key, def)) as typeof config.get);
  });

  afterEach(async () => {
    // Let socket handlers finish before the next test reads Redis.
    await sleep(50);
  });

  afterAll(async () => {
    for (const s of sockets) {
      s.close();
    }
    vi.restoreAllMocks();
    delete process.env.LOCATION_PING_MIN_INTERVAL_MS;
    const ds = db();
    await sleep(500);
    const profiles: { id: string }[] = userIds.length
      ? await ds.query('SELECT id FROM "runner_profiles" WHERE "userId" = ANY($1)', [userIds])
      : [];
    await redis().del(...profiles.flatMap((p) => [runnerPresenceKey(p.id), `runner:location:${p.id}`]));
    if (errandIds.length > 0) {
      await ds.query(
        `DELETE FROM "payment_transactions" WHERE "paymentId" IN (SELECT id FROM "payments" WHERE "errandId" = ANY($1))`,
        [errandIds],
      );
      await ds.query('DELETE FROM "payments" WHERE "errandId" = ANY($1)', [errandIds]);
      await ds.query('DELETE FROM "refund_reviews" WHERE "errandId" = ANY($1)', [errandIds]);
      for (const table of [
        'runner_locations',
        'errand_assignments',
        'errand_status_history',
        'errand_items',
        'errand_locations',
        'quotes',
        'notification_log',
      ]) {
        await ds.query(`DELETE FROM "${table}" WHERE "errandId" = ANY($1)`, [errandIds]);
      }
      for (let attempt = 0; ; attempt += 1) {
        await ds.query('DELETE FROM "notifications" WHERE "errandId" = ANY($1)', [errandIds]);
        try {
          await ds.query('DELETE FROM "errands" WHERE id = ANY($1)', [errandIds]);
          break;
        } catch (err) {
          if (attempt >= 5) {
            throw err;
          }
          await sleep(300);
        }
      }
    }
    if (userIds.length > 0) {
      await ds.query('DELETE FROM "notifications" WHERE "userId" = ANY($1)', [userIds]);
      await ds.query('DELETE FROM "notification_log" WHERE "userId" = ANY($1)', [userIds]);
      await ds.query(
        `DELETE FROM "payment_methods" WHERE "customerProfileId" IN (SELECT id FROM "customer_profiles" WHERE "userId" = ANY($1))`,
        [userIds],
      );
      await ds.query(
        `DELETE FROM "runner_locations" WHERE "runnerProfileId" IN (SELECT id FROM "runner_profiles" WHERE "userId" = ANY($1))`,
        [userIds],
      );
      await deleteRunnerVerifications(ds, userIds);
      await ds.query('DELETE FROM "runner_profiles" WHERE "userId" = ANY($1)', [userIds]);
      await ds.query('DELETE FROM "customer_profiles" WHERE "userId" = ANY($1)', [userIds]);
      await ds.query('DELETE FROM "users" WHERE "id" = ANY($1)', [userIds]);
    }
    await app.close();
  });

  it("detects the client from handshake auth.client and writes the presence record; admin reads show it", async () => {
    const admin = await makeUser(UserRole.ADMIN);
    const web = await makeUser(UserRole.RUNNER);
    const appRunner = await makeUser(UserRole.RUNNER);
    const webSocket = await socketFor(web, 'web');
    const appSocket = await socketFor(appRunner);

    // Connect alone records the client (the clock for a web runner who never pings).
    expect(await presenceHash(web)).toMatchObject({ client: 'web', connectedAt: expect.any(String) });
    expect(await presenceHash(appRunner)).toMatchObject({ client: 'app' });
    expect((await presenceHash(web)).lastPingAt).toBeUndefined();

    const before = Date.now();
    expect(await ping(webSocket)).toEqual({ ok: true });
    expect(await ping(appSocket)).toEqual({ ok: true });
    const hash = await presenceHash(web);
    expect(Number(hash.lastPingAt)).toBeGreaterThanOrEqual(before);
    const ttl = (await redis().evalScript("return redis.call('TTL', KEYS[1])", [runnerPresenceKey(web.profileId as string)], [])) as number;
    expect(ttl).toBeGreaterThan(86_400 - 60);
    expect(ttl).toBeLessThanOrEqual(86_400);

    const webRow = await adminRow(admin, web);
    expect(webRow.presence).toEqual({ client: 'web', lastPingAt: new Date(Number(hash.lastPingAt)).toISOString(), webPingsStoppedAt: null });
    expect((await adminRow(admin, appRunner)).presence).toMatchObject({ client: 'app', lastPingAt: expect.any(String), webPingsStoppedAt: null });

    // The runner detail (GET /runners/:id/verifications) carries the same presence.
    const detail = await http().get(`/api/v1/runners/${web.profileId}/verifications`).set(bearer(admin.token)).expect(200);
    expect(detail.body.presence).toEqual(webRow.presence);

    // A runner with no record yet: presence with nulls.
    const quiet = await makeUser(UserRole.RUNNER);
    expect((await adminRow(admin, quiet)).presence).toEqual({ client: null, lastPingAt: null, webPingsStoppedAt: null });

    // Not for runners: the admin list stays admin only.
    await http().get('/api/v1/runners').set(bearer(web.token)).expect(403);
  });

  it('flags a web runner once after 90 s without a ping (sweep run by the maintenance queue) and clears it on the next ping', async () => {
    const admin = await makeUser(UserRole.ADMIN);
    const adminSocket = await connectSocket(baseUrl, admin.token);
    sockets.push(adminSocket);
    const web = await makeUser(UserRole.RUNNER);
    const webSocket = await socketFor(web, 'web');
    expect(await ping(webSocket)).toEqual({ ok: true });
    const lastPingAt = Number((await presenceHash(web)).lastPingAt);

    // 89 s: not yet.
    await age(web, 89);
    await sweep();
    expect(events(adminSocket, 'runner:web_pings_stopped', web)).toEqual([]);

    // 91 s: the queue job flags it.
    await age(web, 91);
    const aged = Number((await presenceHash(web)).lastPingAt);
    expect(aged).toBeLessThan(lastPingAt);
    const queue = app.get<Queue>(getQueueToken(MAINTENANCE_QUEUE));
    await queue.add(WEB_PRESENCE_SWEEP_JOB, {}, { attempts: 1, removeOnComplete: true });
    const stopped = await adminSocket.waitFor<Record<string, unknown>>(
      'runner:web_pings_stopped',
      (d) => d.runnerProfileId === web.profileId,
      10_000,
    );
    expect(stopped).toEqual({ runnerProfileId: web.profileId, lastPingAt: new Date(aged).toISOString(), at: expect.any(String) });
    expect((await adminRow(admin, web)).presence).toMatchObject({ client: 'web', webPingsStoppedAt: stopped.at });
    expect(await availabilityOf(web)).toBe('online');

    // Once only.
    await sweep();
    await sweep();
    await sleep(100);
    expect(events(adminSocket, 'runner:web_pings_stopped', web)).toHaveLength(1);

    // The next ping clears it.
    expect(await ping(webSocket)).toEqual({ ok: true });
    await expect(
      adminSocket.waitFor<Record<string, unknown>>('runner:web_pings_resumed', (d) => d.runnerProfileId === web.profileId),
    ).resolves.toEqual({ runnerProfileId: web.profileId, at: expect.any(String) });
    expect((await adminRow(admin, web)).presence.webPingsStoppedAt).toBeNull();

    // Runner sockets never get the admin events.
    expect(webSocket.received.filter((r) => r.event.startsWith('runner:web_'))).toEqual([]);
  });

  it('flags a web runner who connected but never pinged (lastPingAt null)', async () => {
    const admin = await makeUser(UserRole.ADMIN);
    const adminSocket = await connectSocket(baseUrl, admin.token);
    sockets.push(adminSocket);
    const web = await makeUser(UserRole.RUNNER);
    await socketFor(web, 'web');
    await age(web, 95);
    await sweep();
    await expect(
      adminSocket.waitFor<Record<string, unknown>>('runner:web_pings_stopped', (d) => d.runnerProfileId === web.profileId),
    ).resolves.toEqual({ runnerProfileId: web.profileId, lastPingAt: null, at: expect.any(String) });
  });

  it('sets an idle online web runner offline after 5 min through the availability path; matching then lists them offline', async () => {
    const admin = await makeUser(UserRole.ADMIN);
    const customer = await makeUser(UserRole.CUSTOMER);
    const adminSocket = await connectSocket(baseUrl, admin.token);
    sockets.push(adminSocket);
    const web = await poolRunner();
    const appRunner = await poolRunner();
    const webSocket = await socketFor(web, 'web');
    const appSocket = await socketFor(appRunner);
    expect(await ping(webSocket)).toEqual({ ok: true });
    expect(await ping(appSocket)).toEqual({ ok: true });
    const errandId = await paidErrand(customer, admin);

    const before = await http().get(`/api/v1/errands/${errandId}/candidates`).set(bearer(admin.token)).expect(200);
    expect(before.body.eligibleRemaining).toBe(2);

    // 4 min: flagged, still online.
    await age(web, 240);
    await age(appRunner, 240);
    await sweep();
    expect(await availabilityOf(web)).toBe('online');

    // 5 min + 1 s: offline. The app runner, silent as long, is untouched.
    await age(web, 301);
    await age(appRunner, 3600);
    await sweep();
    expect(await availabilityOf(web)).toBe('offline');
    expect(await availabilityOf(appRunner)).toBe('online');
    const offline = await adminSocket.waitFor<Record<string, unknown>>(
      'runner:web_auto_offline',
      (d) => d.runnerProfileId === web.profileId,
    );
    expect(offline).toEqual({ runnerProfileId: web.profileId, lastPingAt: expect.any(String), at: expect.any(String) });
    expect(events(adminSocket, 'runner:web_pings_stopped', appRunner)).toEqual([]);
    expect(events(adminSocket, 'runner:web_auto_offline', appRunner)).toEqual([]);

    // Going offline clears the flag silently.
    const row = await adminRow(admin, web);
    expect(row.availability).toBe('offline');
    expect(row.presence).toMatchObject({ client: 'web', webPingsStoppedAt: null });
    expect(events(adminSocket, 'runner:web_pings_resumed', web)).toEqual([]);

    // Matching: the auto-offlined runner is listed offline and no longer counts.
    const after = await http().get(`/api/v1/errands/${errandId}/candidates`).set(bearer(admin.token)).expect(200);
    expect(after.body.eligibleRemaining).toBe(1);
    const byId = Object.fromEntries((after.body.items as { runnerProfileId: string }[]).map((c) => [c.runnerProfileId, c]));
    expect(byId[web.profileId as string]).toMatchObject({ offline: true, availability: 'offline' });
    expect(byId[appRunner.profileId as string]).toMatchObject({ offline: false, availability: 'online' });

    // What the website sees on return: pings refused (after the 5 s intake cache) until they go online again.
    await sleep(5_200);
    expect(await ping(webSocket)).toEqual({ ok: false, error: 'runner_offline' });
    await http().patch('/api/v1/runners/me/availability').set(bearer(web.token)).send({ availability: 'online' }).expect(200);
    // Going online restarts the clock: the next sweep leaves them alone.
    await sweep();
    expect(await availabilityOf(web)).toBe('online');
  }, 30_000);

  it('busy web runner: job pings keep the flag off; when they stop it is flagged, stays busy, and the task is untouched', async () => {
    const admin = await makeUser(UserRole.ADMIN);
    const customer = await makeUser(UserRole.CUSTOMER);
    const adminSocket = await connectSocket(baseUrl, admin.token);
    sockets.push(adminSocket);
    const web = await poolRunner();
    const webSocket = await socketFor(web, 'web');
    expect(await ping(webSocket)).toEqual({ ok: true });
    const errandId = await paidErrand(customer, admin);
    await assign(admin, errandId, web);
    await http().post(`/api/v1/errands/${errandId}/accept`).set(bearer(web.token)).expect(200);
    expect(await availabilityOf(web)).toBe('busy');
    const status = (await http().get(`/api/v1/errands/${errandId}`).set(bearer(admin.token)).expect(200)).body.status as string;
    expect(status).toBe('RUNNER_EN_ROUTE');

    // #15 (A§): a busy web runner sends job pings (with errandId); they keep the presence fresh: no flag.
    await age(web, 3600);
    const before = Date.now();
    expect(await ping(webSocket, { lat: SITE.lat + 0.05, lng: SITE.lng, errandId })).toEqual({ ok: true, status: 'RUNNER_EN_ROUTE' });
    const hash = await presenceHash(web);
    expect(hash.client).toBe('web');
    expect(Number(hash.lastPingAt)).toBeGreaterThanOrEqual(before);
    await sweep();
    await sleep(100);
    expect(events(adminSocket, 'runner:web_pings_stopped', web)).toEqual([]);

    // The job pings stop: flagged, still busy (never forced offline mid-job).
    await age(web, 3600);
    await sweep();
    await adminSocket.waitFor('runner:web_pings_stopped', (d: { runnerProfileId: string }) => d.runnerProfileId === web.profileId);
    expect(await availabilityOf(web)).toBe('busy');
    expect(events(adminSocket, 'runner:web_auto_offline', web)).toEqual([]);
    expect((await http().get(`/api/v1/errands/${errandId}`).set(bearer(admin.token)).expect(200)).body.status).toBe(status);
    const assignments: { status: string }[] = await db().query(
      `SELECT status::text AS status FROM "errand_assignments" WHERE "errandId" = $1`,
      [errandId],
    );
    expect(assignments.map((a) => a.status)).toEqual(['accepted']);
  });

  it('keeps an idle web runner holding an open offer online (flag only); the offer is untouched', async () => {
    const admin = await makeUser(UserRole.ADMIN);
    const customer = await makeUser(UserRole.CUSTOMER);
    const adminSocket = await connectSocket(baseUrl, admin.token);
    sockets.push(adminSocket);
    const web = await poolRunner();
    const webSocket = await socketFor(web, 'web');
    expect(await ping(webSocket)).toEqual({ ok: true });
    const errandId = await paidErrand(customer, admin);
    await assign(admin, errandId, web);

    await age(web, 600);
    await sweep();
    await adminSocket.waitFor('runner:web_pings_stopped', (d: { runnerProfileId: string }) => d.runnerProfileId === web.profileId);
    expect(await availabilityOf(web)).toBe('online');
    const assignments: { status: string }[] = await db().query(
      `SELECT status::text AS status FROM "errand_assignments" WHERE "errandId" = $1`,
      [errandId],
    );
    expect(assignments.map((a) => a.status)).toEqual(['assigned']);
  });

  it('never flags or sets offline an app runner, even one who never pinged', async () => {
    const admin = await makeUser(UserRole.ADMIN);
    const adminSocket = await connectSocket(baseUrl, admin.token);
    sockets.push(adminSocket);
    const appRunner = await makeUser(UserRole.RUNNER);
    await socketFor(appRunner, 'ios');
    await age(appRunner, 3600);
    await sweep();
    await sleep(100);
    expect(await availabilityOf(appRunner)).toBe('online');
    expect(events(adminSocket, 'runner:web_pings_stopped', appRunner)).toEqual([]);
    expect((await adminRow(admin, appRunner)).presence).toEqual({ client: 'app', lastPingAt: null, webPingsStoppedAt: null });
  });

  it('a runner going offline clears the flag with no event', async () => {
    const admin = await makeUser(UserRole.ADMIN);
    const adminSocket = await connectSocket(baseUrl, admin.token);
    sockets.push(adminSocket);
    const web = await makeUser(UserRole.RUNNER);
    const webSocket = await socketFor(web, 'web');
    expect(await ping(webSocket)).toEqual({ ok: true });
    await age(web, 120);
    await sweep();
    await adminSocket.waitFor('runner:web_pings_stopped', (d: { runnerProfileId: string }) => d.runnerProfileId === web.profileId);
    await http().patch('/api/v1/runners/me/availability').set(bearer(web.token)).send({ availability: 'offline' }).expect(200);
    expect((await presenceHash(web)).webPingsStoppedAt).toBeUndefined();
    await sleep(100);
    expect(events(adminSocket, 'runner:web_pings_resumed', web)).toEqual([]);
  });
});
