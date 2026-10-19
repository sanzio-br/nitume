import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { UserRole } from '../src/common/enums';
import { CustomersService } from '../src/customers/customers.service';
import { RunnersService } from '../src/runners/runners.service';
import { UsersService } from '../src/users/users.service';
import { deleteRunnerVerifications, readyRunner } from './support/runner-fixtures';

/**
 * Owner answers round 14 (rows 233, 235, 2026-10-19): tasks inside no
 * configured service area are refused at create, submit and quote (233).
 * Areas come from a config spy (RUNNER_SERVICE_AREAS is empty in .env).
 * No row goes into an append-only table (row 198); every row is removed in
 * afterAll by tracked id.
 */
describe('Owner answers round 14 (e2e)', () => {
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

  /** Waits for the notifications worker to write a feed row. */
  const feedRows = async (userId: string, eventType: string, errandId: string, min = 1): Promise<Record<string, unknown>[]> => {
    let rows: Record<string, unknown>[] = [];
    for (let i = 0; i < 40; i += 1) {
      rows = await db().query(
        'SELECT * FROM "notifications" WHERE "userId" = $1 AND "eventType" = $2 AND "errandId" = $3',
        [userId, eventType, errandId],
      );
      if (rows.length >= min) {
        return rows;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    return rows;
  };

  const NAIROBI = { lat: -1.2864, lng: 36.8172 };
  const MOMBASA = { lat: -4.04, lng: 39.7 };

  describe('row 233: service areas at create, submit and quote', () => {
    it('refuses a first point outside every area with 422 location_outside_service_area', async () => {
      onlyArea('oa14-nbo', NAIROBI);
      const customer = await makeUser(UserRole.CUSTOMER);
      const outside = await http()
        .post('/api/v1/errands')
        .set(bearer(customer.token))
        .send({ category: 'inspection', description: 'Check the flat', locations: [{ pointType: 'task_site', lat: MOMBASA.lat, lon: MOMBASA.lng, addressText: 'Nyali' }] })
        .expect(422);
      expect(outside.body).toMatchObject({ code: 'location_outside_service_area', pointType: 'task_site' });
      // Only the first point counts: pickup inside, drop-off outside is fine.
      const pickup = await http()
        .post('/api/v1/errands')
        .set(bearer(customer.token))
        .send({
          category: 'pickup_delivery',
          description: 'Bring the parcel',
          budget: 100,
          locations: [
            { pointType: 'dropoff', lat: MOMBASA.lat, lon: MOMBASA.lng, addressText: 'Nyali' },
            { pointType: 'pickup', lat: NAIROBI.lat, lon: NAIROBI.lng, addressText: 'CBD' },
          ],
        })
        .expect(201);
      errandIds.push(pickup.body.errand.id);
    });

    it('refuses submit and quote of tasks created before the areas were configured', async () => {
      const customer = await makeUser(UserRole.CUSTOMER);
      const admin = await makeUser(UserRole.ADMIN);
      // No areas configured: the check is off.
      const draft = await createErrand(customer, at(MOMBASA));
      const requested = await createErrand(customer, at(MOMBASA));
      await http().post(`/api/v1/errands/${requested.id}/submit`).set(bearer(customer.token)).expect(201);

      onlyArea('oa14-nbo2', NAIROBI);
      const submit = await http().post(`/api/v1/errands/${draft.id}/submit`).set(bearer(customer.token)).expect(422);
      expect(submit.body.code).toBe('location_outside_service_area');
      const quote = await http()
        .post(`/api/v1/errands/${requested.id}/quote`)
        .set(bearer(admin.token))
        .send({ total: 1000, baseFee: 600, distanceFee: 400 })
        .expect(422);
      expect(quote.body).toMatchObject({ code: 'location_outside_service_area', pointType: 'dropoff' });
      // Row 236: the customer is told once, however often the quote is retried, and may cancel.
      await http()
        .post(`/api/v1/errands/${requested.id}/quote`)
        .set(bearer(admin.token))
        .send({ total: 1000, baseFee: 600, distanceFee: 400 })
        .expect(422);
      const told = await feedRows(customer.id, 'service_area.outside', requested.id);
      expect(told).toHaveLength(1);
      expect(told[0]).toMatchObject({ title: 'Outside our service area' });
      await new Promise((r) => setTimeout(r, 1_500));
      const count = async (errandId: string) =>
        Number(
          (
            await db().query(
              `SELECT COUNT(*) AS n FROM "notifications" WHERE "userId" = $1 AND "eventType" = 'service_area.outside' AND "errandId" = $2`,
              [customer.id, errandId],
            )
          )[0].n,
        );
      expect(await count(requested.id)).toBe(1);
      // A refused submit sends nothing (the customer sees the 422 directly).
      expect(await count(draft.id)).toBe(0);
      const statuses: { id: string; s: string }[] = await db().query(
        'SELECT id, status::text AS s FROM "errands" WHERE id = ANY($1)',
        [[draft.id, requested.id]],
      );
      expect(Object.fromEntries(statuses.map((r) => [r.id, r.s]))).toEqual({ [draft.id]: 'DRAFT', [requested.id]: 'REQUESTED' });
    });
  });

  describe('row 236: the customer cancels a task refused as out-of-area', () => {
    it('REQUESTED -> CANCELLED by the customer stays allowed', async () => {
      const customer = await makeUser(UserRole.CUSTOMER);
      const task = await createErrand(customer, at(MOMBASA));
      await http().post(`/api/v1/errands/${task.id}/submit`).set(bearer(customer.token)).expect(201);
      onlyArea('oa14-nbo3', NAIROBI);
      await http().patch(`/api/v1/errands/${task.id}/status`).set(bearer(customer.token)).send({ to: 'CANCELLED' }).expect(200);
    });
  });

  describe('row 237: no payment after the deadline; the customer sets a new one', () => {
    it('refuses to start payment once the deadline passed, then pays after a new deadline', async () => {
      const customer = await makeUser(UserRole.CUSTOMER);
      const admin = await makeUser(UserRole.ADMIN);
      const task = await createErrand(customer, { deadlineAt: new Date(Date.now() + 3_600_000).toISOString() });
      await http().post(`/api/v1/errands/${task.id}/submit`).set(bearer(customer.token)).expect(201);
      await http()
        .post(`/api/v1/errands/${task.id}/quote`)
        .set(bearer(admin.token))
        .send({ total: 1000, baseFee: 600, distanceFee: 400 })
        .expect(201);
      await http().patch(`/api/v1/errands/${task.id}/status`).set(bearer(customer.token)).send({ to: 'ACCEPTED' }).expect(200);
      await db().query(`UPDATE "errands" SET "deadlineAt" = now() - interval '1 minute' WHERE id = $1`, [task.id]);

      const refused = await http().post(`/api/v1/payments/${task.id}/initiate`).set(bearer(customer.token)).send({}).expect(409);
      expect(refused.body).toMatchObject({ code: 'deadline_passed_before_payment', deadlineAt: expect.any(String) });

      const past = await http()
        .patch(`/api/v1/errands/${task.id}`)
        .set(bearer(customer.token))
        .send({ deadlineAt: new Date(Date.now() - 60_000).toISOString() })
        .expect(400);
      expect(past.body.code).toBe('deadline_in_past');
      const [{ title: before }]: { title: string | null }[] = await db().query('SELECT title FROM "errands" WHERE id = $1', [task.id]);
      const next = new Date(Date.now() + 2 * 3_600_000).toISOString();
      const moved = await http().patch(`/api/v1/errands/${task.id}`).set(bearer(customer.token)).send({ deadlineAt: next }).expect(200);
      expect(moved.body).toMatchObject({ deadlineAt: next, urgency: 'urgent', title: before });

      const init = await http().post(`/api/v1/payments/${task.id}/initiate`).set(bearer(customer.token)).send({}).expect(201);
      await http().post('/api/v1/payments/mpesa/callback').send({ reference: init.body.reference, resultCode: 0 }).expect(201);
      const paid = await http().get(`/api/v1/errands/${task.id}`).set(bearer(customer.token)).expect(200);
      expect(paid.body).toMatchObject({ status: 'PAYMENT_CONFIRMED', deadlineAt: next });
      const late = await http()
        .patch(`/api/v1/errands/${task.id}`)
        .set(bearer(customer.token))
        .send({ deadlineAt: new Date(Date.now() + 5 * 3_600_000).toISOString() })
        .expect(409);
      expect(late.body).toMatchObject({ code: 'deadline_not_editable', status: 'PAYMENT_CONFIRMED' });
    });
  });

  describe('rows 235, 239: a Flexible task has no deadline until payment', () => {
    const quoteAndAccept = async (customer: Actor, admin: Actor, errandId: string) => {
      await http().post(`/api/v1/errands/${errandId}/submit`).set(bearer(customer.token)).expect(201);
      await http()
        .post(`/api/v1/errands/${errandId}/quote`)
        .set(bearer(admin.token))
        .send({ total: 1000, baseFee: 600, distanceFee: 400 })
        .expect(201);
      await http().patch(`/api/v1/errands/${errandId}/status`).set(bearer(customer.token)).send({ to: 'ACCEPTED' }).expect(200);
    };

    it('reads null everywhere before payment, pays days later, and gets payment time + 24 h', async () => {
      const customer = await makeUser(UserRole.CUSTOMER);
      const admin = await makeUser(UserRole.ADMIN);
      const runner = await makeUser(UserRole.RUNNER);
      const task = await createErrand(customer);

      const own = await http().get(`/api/v1/errands/${task.id}`).set(bearer(customer.token)).expect(200);
      expect(own.body).toMatchObject({ deadlineAt: null, urgency: 'standard' });
      await quoteAndAccept(customer, admin, task.id);
      // Customers never list their drafts; after submit it is listed with no deadline.
      const list = await http().get('/api/v1/errands').set(bearer(customer.token)).expect(200);
      expect((list.body.items as { id: string; deadlineAt: unknown }[]).find((e) => e.id === task.id)).toMatchObject({ deadlineAt: null });
      const adminView = await http().get(`/api/v1/errands/${task.id}`).set(bearer(admin.token)).expect(200);
      expect(adminView.body).toMatchObject({ status: 'ACCEPTED', deadlineAt: null, deadlinePassed: false, canExpire: { noRunner: false, deadlinePassed: false } });
      const adminList = await http().get('/api/v1/errands').query({ status: 'ACCEPTED', limit: 100 }).set(bearer(admin.token)).expect(200);
      expect((adminList.body.items as { id: string }[]).find((e) => e.id === task.id)).toMatchObject({ deadlineAt: null, deadlinePassed: false });

      // Created three days ago: the clock had not started, so payment is not refused (row 237 applies to chosen deadlines only).
      await db().query(`UPDATE "errands" SET "createdAt" = now() - interval '3 days' WHERE id = $1`, [task.id]);
      const before = Date.now();
      const init = await http().post(`/api/v1/payments/${task.id}/initiate`).set(bearer(customer.token)).send({}).expect(201);
      await http().post('/api/v1/payments/mpesa/callback').send({ reference: init.body.reference, resultCode: 0 }).expect(201);
      const paid = await http().get(`/api/v1/errands/${task.id}`).set(bearer(customer.token)).expect(200);
      expect(paid.body).toMatchObject({ status: 'PAYMENT_CONFIRMED', urgency: 'standard' });
      const hours = (new Date(paid.body.deadlineAt as string).getTime() - before) / 3_600_000;
      expect(hours).toBeGreaterThan(23.99);
      expect(hours).toBeLessThan(24.05);

      // The runner reads the deadline on the offer.
      await http().post(`/api/v1/errands/${task.id}/assign`).set(bearer(admin.token)).send({ runnerProfileId: runner.profileId }).expect(201);
      const job = await http().get(`/api/v1/runners/me/jobs/${task.id}`).set(bearer(runner.token)).expect(200);
      expect(job.body.deadlineAt).toBe(paid.body.deadlineAt);
    });

    it('a Flexible task cancelled before payment keeps no deadline', async () => {
      const customer = await makeUser(UserRole.CUSTOMER);
      const admin = await makeUser(UserRole.ADMIN);
      const task = await createErrand(customer);
      await quoteAndAccept(customer, admin, task.id);
      await http().patch(`/api/v1/errands/${task.id}/status`).set(bearer(customer.token)).send({ to: 'CANCELLED' }).expect(200);
      const [row]: { deadlineAt: Date | null; s: string }[] = await db().query(
        'SELECT "deadlineAt", status::text AS s FROM "errands" WHERE id = $1',
        [task.id],
      );
      expect(row).toEqual({ deadlineAt: null, s: 'CANCELLED' });
    });

    it('the database refuses a paid task without a deadline (CHECK)', async () => {
      const customer = await makeUser(UserRole.CUSTOMER);
      const task = await createErrand(customer);
      await expect(db().query(`UPDATE "errands" SET status = 'PAYMENT_CONFIRMED' WHERE id = $1`, [task.id])).rejects.toThrow(
        /CHK_errands_deadline_from_payment/,
      );
    });
  });

  describe('rows 243, 244: who changes the deadline, and back to Flexible', () => {
    it('admins cannot set it; the customer can clear it before payment and the clock then starts at payment', async () => {
      const customer = await makeUser(UserRole.CUSTOMER);
      const admin = await makeUser(UserRole.ADMIN);
      const task = await createErrand(customer, { deadlineAt: new Date(Date.now() + 3_600_000).toISOString() });
      await http().post(`/api/v1/errands/${task.id}/submit`).set(bearer(customer.token)).expect(201);

      const byAdmin = await http()
        .patch(`/api/v1/errands/${task.id}`)
        .set(bearer(admin.token))
        .send({ deadlineAt: new Date(Date.now() + 5 * 3_600_000).toISOString() })
        .expect(403);
      expect(byAdmin.body.code).toBe('deadline_customer_only');
      await http().patch(`/api/v1/errands/${task.id}`).set(bearer(admin.token)).send({ title: 'Ops renamed it' }).expect(200);

      const flexible = await http().patch(`/api/v1/errands/${task.id}`).set(bearer(customer.token)).send({ deadlineAt: null }).expect(200);
      expect(flexible.body).toMatchObject({ deadlineAt: null, urgency: 'standard', title: 'Ops renamed it' });

      await http()
        .post(`/api/v1/errands/${task.id}/quote`)
        .set(bearer(admin.token))
        .send({ total: 1000, baseFee: 600, distanceFee: 400 })
        .expect(201);
      await http().patch(`/api/v1/errands/${task.id}/status`).set(bearer(customer.token)).send({ to: 'ACCEPTED' }).expect(200);
      const before = Date.now();
      const init = await http().post(`/api/v1/payments/${task.id}/initiate`).set(bearer(customer.token)).send({}).expect(201);
      await http().post('/api/v1/payments/mpesa/callback').send({ reference: init.body.reference, resultCode: 0 }).expect(201);
      const paid = await http().get(`/api/v1/errands/${task.id}`).set(bearer(customer.token)).expect(200);
      const hours = (new Date(paid.body.deadlineAt as string).getTime() - before) / 3_600_000;
      expect(hours).toBeGreaterThan(23.99);
      expect(hours).toBeLessThan(24.05);
      const late = await http().patch(`/api/v1/errands/${task.id}`).set(bearer(customer.token)).send({ deadlineAt: null }).expect(409);
      expect(late.body).toMatchObject({ code: 'deadline_not_editable', status: 'PAYMENT_CONFIRMED' });
    });
  });
});
