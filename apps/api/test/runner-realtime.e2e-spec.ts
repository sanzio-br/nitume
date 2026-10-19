import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { UserRole } from '../src/common/enums';
import { CustomersService } from '../src/customers/customers.service';
import { ErrandsService } from '../src/errands/errands.service';
import { RedisService } from '../src/infra/redis/redis.service';
import { runnerLiveKey } from '../src/location/location-ingest.service';
import { RunnersService } from '../src/runners/runners.service';
import { UsersService } from '../src/users/users.service';
import { deleteRunnerVerifications, readyRunner } from './support/runner-fixtures';
import { TestSocket, connectSocket } from './support/socket-client';

/**
 * Runner realtime (RA-4, RA-5): the server-joined runner room with
 * `job:offered` / `job:offer_withdrawn` / `price_change:decided`, and the
 * `location:ping` intake (auth, job and state checks, throttle, Redis
 * fan-out to `location:update`, geofenced ARRIVED by the system). Pings
 * stay in Redis only (row 247 open): no runner_locations row and no
 * runner_profiles position is written. Every row created here is removed in
 * afterAll by tracked id; no append-only table is written.
 */
describe('Runner realtime (e2e)', () => {
  let app: INestApplication<App>;
  let baseUrl: string;
  const userIds: string[] = [];
  const errandIds: string[] = [];
  const sockets: TestSocket[] = [];

  // Keep the per-runner ping throttle short so the file runs quickly.
  const MIN_INTERVAL_MS = 300;
  process.env.LOCATION_PING_MIN_INTERVAL_MS = String(MIN_INTERVAL_MS);

  const randomPhone = (): string => `+2547${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const tokenFor = (user: { id: string; role: UserRole; phone: string }): string =>
    new JwtService().sign(
      { sub: user.id, role: user.role, phone: user.phone, type: 'access' },
      { secret: app.get(ConfigService).get<string>('jwt.accessSecret') as string, expiresIn: '5m' },
    );

  type Actor = { id: string; token: string; profileId: string | null };

  const makeUser = async (role: UserRole): Promise<Actor> => {
    const user = await app.get(UsersService).create({ phone: randomPhone(), role });
    userIds.push(user.id);
    let profileId: string | null = null;
    if (role === UserRole.CUSTOMER) {
      profileId = (await app.get(CustomersService).createForUser(user.id)).id;
    } else if (role === UserRole.RUNNER) {
      profileId = (await app.get(RunnersService).createForUser(user.id)).id;
      await readyRunner(app.get(DataSource), profileId);
    }
    return { id: user.id, token: tokenFor(user), profileId };
  };

  const socketFor = async (actor: Actor | null): Promise<TestSocket> => {
    const s = await connectSocket(baseUrl, actor?.token ?? null);
    sockets.push(s);
    return s;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    for (const s of sockets) {
      s.close();
    }
    delete process.env.LOCATION_PING_MIN_INTERVAL_MS;
    const ds = app.get(DataSource);
    // Let queued notification/location jobs for these rows finish first.
    await sleep(500);
    if (errandIds.length > 0) {
      await ds.query(
        `DELETE FROM "payment_transactions" WHERE "paymentId" IN
           (SELECT id FROM "payments" WHERE "errandId" = ANY($1))`,
        [errandIds],
      );
      await ds.query('DELETE FROM "payments" WHERE "errandId" = ANY($1)', [errandIds]);
      await ds.query('DELETE FROM "refund_reviews" WHERE "errandId" = ANY($1)', [errandIds]);
      for (const table of [
        'price_change_requests',
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
        `DELETE FROM "payment_methods" WHERE "customerProfileId" IN
           (SELECT id FROM "customer_profiles" WHERE "userId" = ANY($1))`,
        [userIds],
      );
      await ds.query(
        `DELETE FROM "runner_locations" WHERE "runnerProfileId" IN
           (SELECT id FROM "runner_profiles" WHERE "userId" = ANY($1))`,
        [userIds],
      );
      await deleteRunnerVerifications(ds, userIds);
      await ds.query('DELETE FROM "runner_profiles" WHERE "userId" = ANY($1)', [userIds]);
      await ds.query('DELETE FROM "customer_profiles" WHERE "userId" = ANY($1)', [userIds]);
      await ds.query('DELETE FROM "users" WHERE "id" = ANY($1)', [userIds]);
    }
    await app.close();
  });

  const http = () => request(baseUrl);
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const db = () => app.get(DataSource);

  const SITE = { lat: -4.04, lng: 39.7 };

  const createErrand = async (customer: Actor, body: Record<string, unknown> = {}) => {
    const res = await http()
      .post('/api/v1/errands')
      .set(bearer(customer.token))
      .send({
        category: 'inspection',
        description: 'Check the apartment in Nyali',
        budget: 0,
        locations: [{ pointType: 'task_site', lat: SITE.lat, lon: SITE.lng, addressText: 'Links Road, Nyali' }],
        ...body,
      })
      .expect(201);
    errandIds.push(res.body.errand.id);
    return res.body.errand as { id: string };
  };

  const setStatus = (actor: Actor, errandId: string, to: string, expected = 200) =>
    http().patch(`/api/v1/errands/${errandId}/status`).set(bearer(actor.token)).send({ to }).expect(expected);

  const paidErrand = async (customer: Actor, admin: Actor, body: Record<string, unknown> = {}, payBody: Record<string, unknown> = {}) => {
    const errand = await createErrand(customer, body);
    await http().post(`/api/v1/errands/${errand.id}/submit`).set(bearer(customer.token)).expect(201);
    await http()
      .post(`/api/v1/errands/${errand.id}/quote`)
      .set(bearer(admin.token))
      .send({ total: 1000, baseFee: 600, distanceFee: 400 })
      .expect(201);
    await setStatus(customer, errand.id, 'ACCEPTED');
    const init = await http().post(`/api/v1/payments/${errand.id}/initiate`).set(bearer(customer.token)).send(payBody).expect(201);
    await http().post('/api/v1/payments/mpesa/callback').send({ reference: init.body.reference, resultCode: 0 }).expect(201);
    return errand;
  };

  const assign = (admin: Actor, errandId: string, runner: Actor) =>
    http().post(`/api/v1/errands/${errandId}/assign`).set(bearer(admin.token)).send({ runnerProfileId: runner.profileId }).expect(201);

  const accept = (runner: Actor, errandId: string) =>
    http().post(`/api/v1/errands/${errandId}/accept`).set(bearer(runner.token)).expect(200);

  /** One ping, waiting out the throttle first. */
  const ping = async (s: TestSocket, body: Record<string, unknown>) => {
    await sleep(MIN_INTERVAL_MS + 50);
    return s.emitWithAck<{ ok: boolean; error?: string; status?: string }>('location:ping', body);
  };

  describe('RA-5: runner room', () => {
    it('pushes job:offered to the offered runner only, and job:offer_withdrawn on decline, cancel and lapse', async () => {
      const [customer, admin, runner, other] = [
        await makeUser(UserRole.CUSTOMER),
        await makeUser(UserRole.ADMIN),
        await makeUser(UserRole.RUNNER),
        await makeUser(UserRole.RUNNER),
      ];
      const runnerSocket = await socketFor(runner);
      const otherSocket = await socketFor(other);

      // Decline.
      const e1 = await paidErrand(customer, admin);
      const offer1 = (await assign(admin, e1.id, runner)).body as { assignment: { id: string; offerExpiresAt: string } };
      const offered = await runnerSocket.waitFor<Record<string, unknown>>('job:offered', (d) => d.errandId === e1.id);
      expect(offered).toEqual({
        errandId: e1.id,
        assignmentId: offer1.assignment.id,
        offerExpiresAt: expect.any(String),
        offeredAt: expect.any(String),
      });
      await http().post(`/api/v1/errands/${e1.id}/decline`).set(bearer(runner.token)).send({ reason: 'too_far' }).expect(200);
      await expect(
        runnerSocket.waitFor<Record<string, unknown>>('job:offer_withdrawn', (d) => d.errandId === e1.id),
      ).resolves.toEqual({ errandId: e1.id, assignmentId: offer1.assignment.id, reason: 'declined', at: expect.any(String) });

      // Admin cancel (RUNNER_ASSIGNED -> CANCELLED).
      const e2 = await paidErrand(customer, admin);
      await assign(admin, e2.id, runner);
      await runnerSocket.waitFor('job:offered', (d: { errandId: string }) => d.errandId === e2.id);
      await setStatus(admin, e2.id, 'CANCELLED');
      await expect(
        runnerSocket.waitFor<{ errandId: string; reason: string }>('job:offer_withdrawn', (d) => d.errandId === e2.id),
      ).resolves.toMatchObject({ reason: 'cancelled' });

      // Lapse (row 157): the sweep closes the offer, the task stays RUNNER_ASSIGNED.
      const e3 = await paidErrand(customer, admin);
      await assign(admin, e3.id, runner);
      await db().query(
        `UPDATE "errand_assignments" SET "offerExpiresAt" = now() - interval '1 second' WHERE "errandId" = $1 AND status::text = 'assigned'`,
        [e3.id],
      );
      await app.get(ErrandsService).expireLapsedOffers();
      await expect(
        runnerSocket.waitFor<{ errandId: string; reason: string }>('job:offer_withdrawn', (d) => d.errandId === e3.id),
      ).resolves.toMatchObject({ reason: 'expired' });

      // The other runner heard nothing about these offers.
      expect(otherSocket.received.filter((r) => r.event.startsWith('job:'))).toEqual([]);
    });

    it('pushes price_change:decided to the runner (admin reject keeps the task going)', async () => {
      const [customer, admin, runner] = [
        await makeUser(UserRole.CUSTOMER),
        await makeUser(UserRole.ADMIN),
        await makeUser(UserRole.RUNNER),
      ];
      const errand = await paidErrand(
        customer,
        admin,
        {
          category: 'buy_for_me',
          budget: 500,
          locations: [{ pointType: 'dropoff', lat: SITE.lat, lon: SITE.lng, addressText: 'Links Road, Nyali' }],
        },
        { merchantRoute: 'send_to_runner' },
      );
      await assign(admin, errand.id, runner);
      await accept(runner, errand.id);
      await setStatus(runner, errand.id, 'ARRIVED');
      await setStatus(runner, errand.id, 'IN_PROGRESS');
      const runnerSocket = await socketFor(runner);
      const req = await http()
        .post(`/api/v1/errands/${errand.id}/price-change`)
        .set(bearer(runner.token))
        .send({ toPrice: 650, reason: 'The shop raised the price' })
        .expect(201);
      await http().post(`/api/v1/errands/${errand.id}/price-change/${req.body.id}/reject`).set(bearer(admin.token)).expect(201);
      await expect(runnerSocket.waitFor('price_change:decided')).resolves.toEqual({
        errandId: errand.id,
        requestId: req.body.id,
        status: 'rejected',
        outcome: 'rejected',
        fromPrice: '500.00',
        toPrice: '650.00',
        decidedAt: expect.any(String),
      });
    });
  });

  describe('RA-4: location:ping', () => {
    it('fans out only the accepted runner, in the live states, to the errand room and admins', async () => {
      const [customer, admin, runner, stranger] = [
        await makeUser(UserRole.CUSTOMER),
        await makeUser(UserRole.ADMIN),
        await makeUser(UserRole.RUNNER),
        await makeUser(UserRole.RUNNER),
      ];
      const errand = await paidErrand(customer, admin);
      await assign(admin, errand.id, runner);
      const runnerSocket = await socketFor(runner);
      const customerSocket = await socketFor(customer);
      const adminSocket = await socketFor(admin);
      await expect(customerSocket.emitWithAck('errand:join', { errandId: errand.id })).resolves.toMatchObject({ ok: true });

      const far = { lat: -4.1, lng: 39.6 };
      // Open offer only (row 183): refused, nothing reaches the customer.
      await expect(ping(runnerSocket, { ...far, errandId: errand.id })).resolves.toEqual({ ok: false, error: 'forbidden' });

      await accept(runner, errand.id);
      const ts = new Date().toISOString();
      await expect(ping(runnerSocket, { ...far, errandId: errand.id, accuracy: 12, ts })).resolves.toEqual({
        ok: true,
        status: 'RUNNER_EN_ROUTE',
      });
      const update = { errandId: errand.id, lat: far.lat, lng: far.lng, eta: null, accuracy: 12, ts };
      await expect(customerSocket.waitFor('location:update')).resolves.toEqual(update);
      await expect(adminSocket.waitFor('location:update', (d: { errandId: string }) => d.errandId === errand.id)).resolves.toEqual(update);
      // Throttle: of two back-to-back pings the second is dropped.
      await sleep(MIN_INTERVAL_MS + 50);
      const pair = await Promise.all([
        runnerSocket.emitWithAck('location:ping', { ...far, errandId: errand.id }),
        runnerSocket.emitWithAck('location:ping', { ...far, errandId: errand.id }),
      ]);
      expect(pair).toEqual([{ ok: true, status: 'RUNNER_EN_ROUTE' }, { ok: false, error: 'rate_limited' }]);

      // Another runner, a customer, garbage and an anonymous socket.
      const strangerSocket = await socketFor(stranger);
      await expect(ping(strangerSocket, { ...far, errandId: errand.id })).resolves.toEqual({ ok: false, error: 'forbidden' });
      await expect(ping(customerSocket, far)).resolves.toEqual({ ok: false, error: 'not_runner' });
      await expect(ping(runnerSocket, { lat: 'x', lng: 1 })).resolves.toEqual({ ok: false, error: 'invalid_payload' });
      await expect(ping(runnerSocket, { ...far, ts: new Date(Date.now() - 5 * 60_000).toISOString() })).resolves.toEqual({
        ok: false,
        error: 'stale_ping',
      });
      const anon = await socketFor(null);
      expect(anon.closed).toBe(true);

      // Errand-less ping: live presence only, never fanned out.
      const before = customerSocket.received.filter((r) => r.event === 'location:update').length;
      await expect(ping(runnerSocket, { lat: -4.2, lng: 39.5 })).resolves.toEqual({ ok: true });
      await sleep(200);
      expect(customerSocket.received.filter((r) => r.event === 'location:update').length).toBe(before);

      // Redis only (row 247): live key set, nothing in PostgreSQL.
      const live = JSON.parse((await app.get(RedisService).get(runnerLiveKey(runner.profileId as string))) as string) as Record<string, unknown>;
      expect(live).toMatchObject({ lat: -4.2, lng: 39.5, errandId: null });
      await sleep(300);
      const trail: unknown[] = await db().query('SELECT id FROM "runner_locations" WHERE "runnerProfileId" = $1', [runner.profileId]);
      expect(trail).toEqual([]);
      const [profile] = (await db().query('SELECT "currentLocation", "lastPingAt" FROM "runner_profiles" WHERE id = $1', [
        runner.profileId,
      ])) as { currentLocation: unknown; lastPingAt: unknown }[];
      expect(profile).toEqual({ currentLocation: null, lastPingAt: null });

      // The tracking snapshot reads the live position.
      const tracking = await http().get(`/api/v1/errands/${errand.id}/tracking`).set(bearer(customer.token)).expect(200);
      expect(tracking.body.runnerLocation).toMatchObject({ lat: -4.2, lng: 39.5 });

      // A job that left the live states: the runner is told to stop.
      await setStatus(runner, errand.id, 'FAILED');
      await expect(ping(runnerSocket, { ...far, errandId: errand.id })).resolves.toEqual({
        ok: false,
        error: 'not_live',
        status: 'FAILED',
      });
    });

    it('moves RUNNER_EN_ROUTE -> ARRIVED by the system inside the geofence (§4.3)', async () => {
      const [customer, admin, runner] = [
        await makeUser(UserRole.CUSTOMER),
        await makeUser(UserRole.ADMIN),
        await makeUser(UserRole.RUNNER),
      ];
      const errand = await paidErrand(customer, admin);
      await assign(admin, errand.id, runner);
      await accept(runner, errand.id);
      const runnerSocket = await socketFor(runner);
      const customerSocket = await socketFor(customer);
      await customerSocket.emitWithAck('errand:join', { errandId: errand.id });

      // About 1 km away: no arrival. A fix too imprecise for the radius: no arrival.
      await expect(ping(runnerSocket, { lat: SITE.lat + 0.009, lng: SITE.lng, errandId: errand.id })).resolves.toMatchObject({ ok: true });
      await expect(
        ping(runnerSocket, { lat: SITE.lat, lng: SITE.lng, accuracy: 500, errandId: errand.id }),
      ).resolves.toMatchObject({ ok: true });
      await sleep(500);
      const still = await http().get(`/api/v1/errands/${errand.id}`).set(bearer(customer.token)).expect(200);
      expect(still.body.status).toBe('RUNNER_EN_ROUTE');

      // About 30 m from the task site.
      await expect(
        ping(runnerSocket, { lat: SITE.lat + 0.0003, lng: SITE.lng, accuracy: 10, errandId: errand.id }),
      ).resolves.toMatchObject({ ok: true, status: 'RUNNER_EN_ROUTE' });
      await expect(
        customerSocket.waitFor('errand:status_changed', (d: { status: string }) => d.status === 'ARRIVED', 8000),
      ).resolves.toMatchObject({ errandId: errand.id, from: 'RUNNER_EN_ROUTE' });
      const history = await http().get(`/api/v1/errands/${errand.id}/history`).set(bearer(runner.token)).expect(200);
      const arrived = (history.body as { toStatus: string; actorType: string; note: string | null }[]).find((h) => h.toStatus === 'ARRIVED');
      expect(arrived).toMatchObject({ actorType: 'system', note: 'Geofence arrival' });
      // Still live after arrival; no second arrival is attempted.
      await expect(ping(runnerSocket, { lat: SITE.lat, lng: SITE.lng, errandId: errand.id })).resolves.toEqual({
        ok: true,
        status: 'ARRIVED',
      });
    });

    it('ignores an offline runner (row 123)', async () => {
      const runner = await makeUser(UserRole.RUNNER);
      await http().patch('/api/v1/runners/me/availability').set(bearer(runner.token)).send({ availability: 'offline' }).expect(200);
      const s = await socketFor(runner);
      await expect(ping(s, { lat: -1.28, lng: 36.82 })).resolves.toEqual({ ok: false, error: 'runner_offline' });
    });
  });
});
