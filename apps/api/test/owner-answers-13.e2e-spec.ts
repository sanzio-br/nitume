import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { UserRole } from '../src/common/enums';
import { CustomersService } from '../src/customers/customers.service';
import { RunnersService } from '../src/runners/runners.service';
import { UsersService } from '../src/users/users.service';
import { ErrandsService } from '../src/errands/errands.service';
import { deleteRunnerVerifications, readyRunner } from './support/runner-fixtures';

/**
 * Owner answers round 13 (rows 220, 221, 224-229, 231, 232, 2026-10-19):
 * the PAYMENT_CONFIRMED "Expire task" (201, 225, 226), the paid-task
 * deadline feed item (220), the default deadline and its read (221), the
 * e2e Redis key prefix (224), and the expire-vs-assign / expire-vs-accept
 * races (round-12 reviewer). Each pool test uses its own service area
 * (config spy). No row goes into an append-only table (row 198); every row
 * is removed in afterAll by tracked id.
 */
describe('Owner answers round 13 (e2e)', () => {
  let app: INestApplication<App>;
  let baseUrl: string;
  const userIds: string[] = [];
  const errandIds: string[] = [];

  const randomPhone = (): string => `+2547${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;

  const tokenFor = (user: { id: string; role: UserRole; phone: string }): string =>
    new JwtService().sign(
      { sub: user.id, role: user.role, phone: user.phone, type: 'access' },
      { secret: app.get(ConfigService).get<string>('jwt.accessSecret') as string, expiresIn: '5m' },
    );

  type Actor = { id: string; token: string; profileId: string | null };

  const makeUser = async (role: UserRole, displayName?: string, opts: { ready?: boolean } = {}): Promise<Actor> => {
    const users = app.get(UsersService);
    const user = await users.create({ phone: randomPhone(), role });
    if (displayName) {
      await users.updateProfile(user.id, { displayName });
    }
    userIds.push(user.id);
    let profileId: string | null = null;
    if (role === UserRole.CUSTOMER) {
      profileId = (await app.get(CustomersService).createForUser(user.id)).id;
    } else if (role === UserRole.RUNNER) {
      profileId = (await app.get(RunnersService).createForUser(user.id)).id;
      if (opts.ready !== false) {
        // RA-8: verified and online, so assign and accept work.
        await readyRunner(app.get(DataSource), profileId);
      }
    }
    return { id: user.id, token: tokenFor(user), profileId };
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
    const ds = app.get(DataSource);
    if (errandIds.length > 0) {
      await ds.query(
        `DELETE FROM "payment_transactions" WHERE "paymentId" IN
           (SELECT id FROM "payments" WHERE "errandId" = ANY($1))`,
        [errandIds],
      );
      await ds.query(
        `DELETE FROM "dispute_events" WHERE "disputeId" IN
           (SELECT id FROM "disputes" WHERE "errandId" = ANY($1))`,
        [errandIds],
      );
      // Payments and refund reviews reference price_change_requests.
      await ds.query('DELETE FROM "payments" WHERE "errandId" = ANY($1)', [errandIds]);
      await ds.query('DELETE FROM "refund_reviews" WHERE "errandId" = ANY($1)', [errandIds]);
      // Explicit list (reviewer minor 7): the tables this file writes with an
      // errandId. It never writes evidence, disputes, chat, ratings, price
      // changes, runner locations or any append-only table.
      for (const table of [
        'errand_assignments',
        'errand_status_history',
        'errand_items',
        'errand_locations',
        'quotes',
        'notification_log',
      ]) {
        await ds.query(`DELETE FROM "${table}" WHERE "errandId" = ANY($1)`, [errandIds]);
      }
      // A queued feed job may still write a notification for these errands: clear and retry.
      for (let attempt = 0; ; attempt += 1) {
        await ds.query('DELETE FROM "notifications" WHERE "errandId" = ANY($1)', [errandIds]);
        try {
          await ds.query('DELETE FROM "errands" WHERE id = ANY($1)', [errandIds]);
          break;
        } catch (err) {
          if (attempt >= 5) {
            throw err;
          }
          await new Promise((r) => setTimeout(r, 300));
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

  const createErrand = async (customer: Actor, body: Record<string, unknown> = {}) => {
    const res = await http()
      .post('/api/v1/errands')
      .set(bearer(customer.token))
      .send({
        category: 'inspection',
        description: 'Check the apartment in Nyali',
        budget: 0,
        locations: [{ pointType: 'task_site', lat: -4.04, lon: 39.7, addressText: 'Links Road, Nyali' }],
        ...body,
      })
      .expect(201);
    errandIds.push(res.body.errand.id);
    return res.body.errand as { id: string };
  };

  const buyForMe = {
    category: 'buy_for_me',
    budget: 500,
    locations: [{ pointType: 'dropoff', lat: -4.04, lon: 39.7, addressText: 'Links Road, Nyali' }],
  };

  const setStatus = (actor: Actor, errandId: string, to: string, expected = 200) =>
    http().patch(`/api/v1/errands/${errandId}/status`).set(bearer(actor.token)).send({ to }).expect(expected);

  const submitAndQuote = async (customer: Actor, admin: Actor, errandId: string, expiresAt?: string) => {
    await http().post(`/api/v1/errands/${errandId}/submit`).set(bearer(customer.token)).expect(201);
    await http()
      .post(`/api/v1/errands/${errandId}/quote`)
      .set(bearer(admin.token))
      .send({ total: 1000, baseFee: 600, distanceFee: 400, ...(expiresAt ? { expiresAt } : {}) })
      .expect(201);
  };

  const pay = async (customer: Actor, errandId: string, body: Record<string, unknown> = {}) => {
    const init = await http()
      .post(`/api/v1/payments/${errandId}/initiate`)
      .set(bearer(customer.token))
      .send(body)
      .expect(201);
    await http()
      .post('/api/v1/payments/mpesa/callback')
      .send({ reference: init.body.reference, resultCode: 0 })
      .expect(201);
  };

  /** A paid errand, waiting for a runner (PAYMENT_CONFIRMED). */
  const paidErrand = async (customer: Actor, admin: Actor, body: Record<string, unknown> = buyForMe) => {
    const errand = await createErrand(customer, body);
    await submitAndQuote(customer, admin, errand.id);
    await setStatus(customer, errand.id, 'ACCEPTED');
    await pay(customer, errand.id, Number(body.budget ?? 0) > 0 ? { merchantRoute: 'send_to_runner' } : {});
    return errand;
  };

  const assign = (admin: Actor, errandId: string, runner: Actor, expected = 201) =>
    http()
      .post(`/api/v1/errands/${errandId}/assign`)
      .set(bearer(admin.token))
      .send({ runnerProfileId: runner.profileId })
      .expect(expected);

  /** Waits for the notifications worker to write a feed row. */
  const feedRow = async (userId: string, eventType: string, errandId: string): Promise<Record<string, unknown> | null> => {
    for (let i = 0; i < 40; i += 1) {
      const rows: Record<string, unknown>[] = await db().query(
        'SELECT * FROM "notifications" WHERE "userId" = $1 AND "eventType" = $2 AND "errandId" = $3',
        [userId, eventType, errandId],
      );
      if (rows.length > 0) {
        return rows[0];
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    return null;
  };

  let spy: { mockRestore: () => void } | null = null;
  afterEach(() => {
    spy?.mockRestore();
    spy = null;
  });

  /** One service area of radius 1 km around `point`, as the only configured area. */
  const onlyArea = (id: string, point: { lat: number; lng: number }) => {
    const config = app.get(ConfigService);
    const original = config.get.bind(config);
    spy = vi
      .spyOn(config, 'get')
      .mockImplementation(((key: string, def?: unknown) =>
        key === 'runners.serviceAreas' ? [{ id, name: id.toUpperCase(), ...point, radiusKm: 1 }] : original(key, def)) as typeof config.get);
  };

  const at = (point: { lat: number; lng: number }) => ({
    ...buyForMe,
    locations: [{ pointType: 'dropoff', lat: point.lat, lon: point.lng, addressText: 'Test point' }],
  });

  const detail = async (admin: Actor, errandId: string) =>
    (await http().get(`/api/v1/errands/${errandId}`).set(bearer(admin.token)).expect(200)).body as Record<string, unknown>;

  const expire = (admin: Actor, errandId: string, body: Record<string, unknown>, expected: number) =>
    http().post(`/api/v1/errands/${errandId}/expire`).set(bearer(admin.token)).send(body).expect(expected);

  const setDeadlinePast = (errandId: string) =>
    db().query(`UPDATE "errands" SET "deadlineAt" = now() - interval '1 minute' WHERE id = $1`, [errandId]);

  const feedCount = async (userId: string, eventType: string, errandId: string): Promise<number> => {
    const rows: { n: string }[] = await db().query(
      'SELECT COUNT(*) AS n FROM "notifications" WHERE "userId" = $1 AND "eventType" = $2 AND "errandId" = $3',
      [userId, eventType, errandId],
    );
    return Number(rows[0].n);
  };

  describe('rows 201, 220, 225, 226: a paid task never offered, past its deadline', () => {
    it('reports it to ops once, refuses assign, and lets an admin expire it with a reason', async () => {
      const customer = await makeUser(UserRole.CUSTOMER);
      const admin = await makeUser(UserRole.ADMIN, 'Ops Achieng');
      const runner = await makeUser(UserRole.RUNNER);
      const errand = await paidErrand(customer, admin);

      // Before the deadline: no action, and the expire is refused.
      expect((await detail(admin, errand.id)).canExpire).toEqual({ noRunner: false, deadlinePassed: false });
      const early = await expire(admin, errand.id, { reason: 'Customer asked us to stop.', fromStatus: 'PAYMENT_CONFIRMED' }, 409);
      expect(early.body).toMatchObject({ code: 'expiry_not_allowed', reason: 'deadline_not_passed' });

      await setDeadlinePast(errand.id);
      expect((await detail(admin, errand.id)).canExpire).toEqual({ noRunner: false, deadlinePassed: true });
      expect((await assign(admin, errand.id, runner, 409)).body.code).toBe('task_deadline_passed');

      // Rows 201, 220: one feed item per task, however often the sweep runs; no state change.
      const errands = app.get(ErrandsService);
      expect(await errands.reportPaidPastDeadline(new Date(), 200, [errand.id])).toEqual([errand.id]);
      expect(await feedRow(admin.id, 'deadline_passed', errand.id)).toMatchObject({
        title: 'Deadline passed',
        body: `The customer's deadline for ${String((await detail(admin, errand.id)).reference)} passed before a runner was assigned. Expire the task or contact the customer.`,
      });
      await errands.reportPaidPastDeadline(new Date(), 200, [errand.id]);
      await errands.reportPaidPastDeadline(new Date(), 200, [errand.id]);
      await new Promise((r) => setTimeout(r, 1_500));
      expect(await feedCount(admin.id, 'deadline_passed', errand.id)).toBe(1);
      expect((await detail(admin, errand.id)).status).toBe('PAYMENT_CONFIRMED');
      expect(await feedCount(customer.id, 'errand.EXPIRED', errand.id)).toBe(0);

      // The wrong action for this status is refused by name.
      const wrong = await expire(admin, errand.id, { reason: 'Customer asked us to stop.', fromStatus: 'RUNNER_ASSIGNED' }, 409);
      expect(wrong.body).toMatchObject({ reason: 'not_runner_assigned', status: 'PAYMENT_CONFIRMED' });
      expect((await expire(admin, errand.id, { reason: 'short', fromStatus: 'PAYMENT_CONFIRMED' }, 400)).body.code).toBe(
        'expiry_reason_invalid',
      );
      const generic = await http()
        .patch(`/api/v1/errands/${errand.id}/status`)
        .set(bearer(admin.token))
        .send({ to: 'EXPIRED' })
        .expect(409);
      expect(generic.body.code).toBe('transition_requires_admin_expiry');

      const done = await expire(admin, errand.id, { reason: '  Customer unreachable after the deadline.  ', fromStatus: 'PAYMENT_CONFIRMED' }, 200);
      expect(done.body.history).toMatchObject({
        fromStatus: 'PAYMENT_CONFIRMED',
        toStatus: 'EXPIRED',
        actorType: 'admin',
        actorId: admin.id,
        note: 'Customer unreachable after the deadline.',
      });
      expect(await detail(admin, errand.id)).toMatchObject({
        status: 'EXPIRED',
        canExpire: { noRunner: false, deadlinePassed: false },
        expiry: { trigger: 'admin', fromStatus: 'PAYMENT_CONFIRMED', by: { id: admin.id, displayName: 'Ops Achieng' } },
      });
      const reviews: { trigger: string }[] = await db().query(
        'SELECT trigger::text AS trigger FROM "refund_reviews" WHERE "errandId" = $1',
        [errand.id],
      );
      expect(reviews.map((r) => r.trigger)).toContain('expired_after_payment');
      expect(await feedRow(customer.id, 'errand.EXPIRED', errand.id)).toMatchObject({ title: 'No runner available' });
      // Expired: no longer reported.
      expect(await errands.reportPaidPastDeadline(new Date(), 200, [errand.id])).toEqual([]);
    });
  });

  describe('rows 206, 221: every task has a deadline', () => {
    it('defaults to creation + defaultDeadlineHours and exposes the default', async () => {
      const customer = await makeUser(UserRole.CUSTOMER);
      const defaults = await http().get('/api/v1/errands/defaults').set(bearer(customer.token)).expect(200);
      expect(defaults.body).toEqual({ defaultDeadlineHours: 24 });
      const errand = await createErrand(customer);
      const [row]: { createdAt: Date; deadlineAt: Date; urgency: string }[] = await db().query(
        'SELECT "createdAt", "deadlineAt", urgency::text AS urgency FROM "errands" WHERE id = $1',
        [errand.id],
      );
      const hours = (new Date(row.deadlineAt).getTime() - new Date(row.createdAt).getTime()) / 3_600_000;
      expect(hours).toBeGreaterThan(23.99);
      expect(hours).toBeLessThan(24.01);
      expect(row.urgency).toBe('standard');
      const given = new Date(Date.now() + 5 * 3_600_000).toISOString();
      const own = await createErrand(customer, { deadlineAt: given });
      const [ownRow]: { deadlineAt: Date }[] = await db().query('SELECT "deadlineAt" FROM "errands" WHERE id = $1', [own.id]);
      expect(new Date(ownRow.deadlineAt).toISOString()).toBe(given);
      const past = await http()
        .post('/api/v1/errands')
        .set(bearer(customer.token))
        .send({
          category: 'inspection',
          description: 'Check the apartment',
          locations: [{ pointType: 'task_site', lat: -4.04, lon: 39.7, addressText: 'Nyali' }],
          deadlineAt: new Date(Date.now() - 60_000).toISOString(),
        })
        .expect(400);
      expect(past.body.code).toBe('deadline_in_past');
      const [{ nullable }]: { nullable: string }[] = await db().query(
        `SELECT is_nullable AS nullable FROM information_schema.columns WHERE table_name = 'errands' AND column_name = 'deadlineAt'`,
      );
      expect(nullable).toBe('NO');
    });
  });

  describe('round-12 reviewer: expire racing assign and accept', () => {
    it('expire vs assign on one task: exactly one wins, and the task is consistent', async () => {
      const point = { lat: -3.65, lng: 39.9 };
      onlyArea('oa13-race', point);
      const customer = await makeUser(UserRole.CUSTOMER);
      const admin = await makeUser(UserRole.ADMIN);
      for (let round = 0; round < 4; round += 1) {
        const first = await makeUser(UserRole.RUNNER);
        const next = await makeUser(UserRole.RUNNER);
        const errand = await paidErrand(customer, admin, at(point));
        await assign(admin, errand.id, first);
        await http().post(`/api/v1/errands/${errand.id}/decline`).set(bearer(first.token)).send({ reason: 'too_far' }).expect(200);
        expect((await detail(admin, errand.id)).canExpire).toMatchObject({ noRunner: true });

        const [assigned, expired] = await Promise.all([
          http().post(`/api/v1/errands/${errand.id}/assign`).set(bearer(admin.token)).send({ runnerProfileId: next.profileId }),
          http()
            .post(`/api/v1/errands/${errand.id}/expire`)
            .set(bearer(admin.token))
            .send({ reason: 'No runner covers this area.', fromStatus: 'RUNNER_ASSIGNED' }),
        ]);
        const statuses = [assigned.status, expired.status].sort((a, b) => a - b);
        expect([
          [200, 409], // expire won: assign meets an EXPIRED task
          [201, 409], // assign won: expire meets an open offer
        ]).toContainEqual(statuses);
        const view = await detail(admin, errand.id);
        const open = (view.assignments as { status: string }[]).filter((a) => a.status === 'assigned');
        if (expired.status === 200) {
          expect(assigned.body.code).toBe('illegal_transition');
          expect(view.status).toBe('EXPIRED');
          expect(open).toHaveLength(0);
        } else {
          expect(expired.body).toMatchObject({ code: 'expiry_not_allowed', reason: 'open_offer' });
          expect(view.status).toBe('RUNNER_ASSIGNED');
          expect(open).toHaveLength(1);
        }
      }
    });

    it('expire vs the runner accept: the accept holds and the expire is refused', async () => {
      const customer = await makeUser(UserRole.CUSTOMER);
      const admin = await makeUser(UserRole.ADMIN);
      const runner = await makeUser(UserRole.RUNNER);
      const errand = await paidErrand(customer, admin);
      await assign(admin, errand.id, runner);
      const [accepted, expired] = await Promise.all([
        http().post(`/api/v1/errands/${errand.id}/accept`).set(bearer(runner.token)),
        http()
          .post(`/api/v1/errands/${errand.id}/expire`)
          .set(bearer(admin.token))
          .send({ reason: 'No runner covers this area.', fromStatus: 'RUNNER_ASSIGNED' }),
      ]);
      expect(accepted.status).toBe(200);
      expect(expired.status).toBe(409);
      expect(['open_offer', 'not_runner_assigned']).toContain(expired.body.reason);
      expect((await detail(admin, errand.id)).status).toBe('RUNNER_EN_ROUTE');
    });
  });

  describe('row 224: e2e Redis keys', () => {
    it('throttle keys of this run carry the nitume_test: prefix', async () => {
      const phone = `+2547${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
      await http().post('/api/v1/auth/otp/request').send({ phone }).expect(201);
      const redis = new Redis({ host: process.env.REDIS_HOST ?? 'localhost', port: Number(process.env.REDIS_PORT ?? 6379), lazyConnect: true });
      await redis.connect();
      try {
        const keys = await redis.keys('nitume_test:throttle:otpRequest:*');
        expect(keys.length).toBeGreaterThan(0);
      } finally {
        redis.disconnect();
      }
    });
  });
});
