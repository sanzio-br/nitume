import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { UserRole } from '../src/common/enums';
import { CustomersService } from '../src/customers/customers.service';
import { RunnersService } from '../src/runners/runners.service';
import { UsersService } from '../src/users/users.service';
import { ErrandsService } from '../src/errands/errands.service';
import { deleteRunnerVerifications, readyRunner } from './support/runner-fixtures';

/**
 * Runner API batch 1 (RA-1, RA-2, RA-3, RA-8, RA-10, RA-18, RA-20; owner
 * rows 113, 115, 116, 126, 185, 186, 187 c): offers, accept, decline, the
 * runner projection, the verification gate, busy, skills and areas, and
 * the deadline expiry. No row goes into an append-only table, so the
 * cleanup never touches a guard trigger (row 198). Every row created here
 * is removed in afterAll by tracked id.
 */
describe('Runner API batch 1 (e2e)', () => {
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

  const accept = (runner: Actor, errandId: string, expected = 200) =>
    http().post(`/api/v1/errands/${errandId}/accept`).set(bearer(runner.token)).expect(expected);

  const me = async (runner: Actor) =>
    (await http().get('/api/v1/runners/me').set(bearer(runner.token)).expect(200)).body as Record<string, unknown>;



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

  const AREAS = [
    { id: 'cbd', name: 'CBD', lat: -1.2864, lng: 36.8172, radiusKm: 2 },
    { id: 'westlands', name: 'Westlands', lat: -1.2676, lng: 36.8108, radiusKm: 3 },
  ];

  describe('RA-8, RA-18, RA-20: runner self view, verification gate, availability', () => {
    it('an unverified runner reads the gate but cannot go online, see offers or be offered a task', async () => {
      const runner = await makeUser(UserRole.RUNNER, 'Brian Kamau', { ready: false });
      const view = await me(runner);
      expect(view).toMatchObject({
        id: runner.profileId,
        shortName: 'Brian K.',
        availability: 'offline',
        maxPurchaseAdvance: '3000.00',
        skills: [],
        serviceAreas: [],
        verification: { verified: false },
      });
      expect(view).not.toHaveProperty('trustScore');
      expect(view).not.toHaveProperty('currentLocation');
      expect((view.verification as { checks: { type: string; side: string | null; status: string }[] }).checks).toEqual([
        { type: 'phone', side: null, status: 'missing' },
        { type: 'government_id', side: 'front', status: 'missing' },
        { type: 'government_id', side: 'back', status: 'missing' },
        { type: 'selfie', side: null, status: 'missing' },
        { type: 'payment_identity', side: null, status: 'missing' },
      ]);
      const online = await http()
        .patch('/api/v1/runners/me/availability')
        .set(bearer(runner.token))
        .send({ availability: 'online' })
        .expect(403);
      expect(online.body).toMatchObject({ code: 'runner_not_verified', verification: { verified: false } });
      const busy = await http()
        .patch('/api/v1/runners/me/availability')
        .set(bearer(runner.token))
        .send({ availability: 'busy' })
        .expect(400);
      expect(busy.body.code).toBe('availability_server_managed');
      const offers = await http().get('/api/v1/runners/me/offers').set(bearer(runner.token)).expect(403);
      expect(offers.body.code).toBe('runner_not_verified');

      const customer = await makeUser(UserRole.CUSTOMER);
      const admin = await makeUser(UserRole.ADMIN);
      const errand = await paidErrand(customer, admin);
      const refused = await assign(admin, errand.id, runner, 409);
      expect(refused.body).toMatchObject({ code: 'runner_not_eligible', reason: 'not_verified' });

      await readyRunner(db(), runner.profileId!);
      expect(await me(runner)).toMatchObject({ availability: 'online', verification: { verified: true } });
    });
  });

  describe('RA-10: skills as categories (row 115), listed service areas (row 116)', () => {
    it('replaces skills with category values and accepts listed areas only', async () => {
      const runner = await makeUser(UserRole.RUNNER);
      const skills = await http()
        .put('/api/v1/runners/me/skills')
        .set(bearer(runner.token))
        .send({ skills: ['inspection', 'buy_for_me'] })
        .expect(200);
      expect(skills.body).toEqual(['buy_for_me', 'inspection']);
      await http().put('/api/v1/runners/me/skills').set(bearer(runner.token)).send({ skills: ['queue_admin'] }).expect(200);
      expect((await me(runner)).skills).toEqual(['queue_admin']);
      await http().put('/api/v1/runners/me/skills').set(bearer(runner.token)).send({ skills: ['shopping'] }).expect(400);
      const business = await http()
        .put('/api/v1/runners/me/skills')
        .set(bearer(runner.token))
        .send({ skills: ['business'] })
        .expect(400);
      expect(business.body.code).toBe('skill_not_offered');

      const config = app.get(ConfigService);
      const original = config.get.bind(config);
      const spy = vi
        .spyOn(config, 'get')
        .mockImplementation(((key: string, def?: unknown) =>
          key === 'runners.serviceAreas' ? AREAS : original(key, def)) as typeof config.get);
      try {
        const list = await http().get('/api/v1/runners/service-areas').set(bearer(runner.token)).expect(200);
        expect(list.body).toEqual({ items: [{ id: 'cbd', name: 'CBD' }, { id: 'westlands', name: 'Westlands' }] });
        const saved = await http()
          .put('/api/v1/runners/me/service-areas')
          .set(bearer(runner.token))
          .send({ areas: ['westlands', 'cbd'] })
          .expect(200);
        expect(saved.body).toEqual([{ id: 'cbd', name: 'CBD' }, { id: 'westlands', name: 'Westlands' }]);
        const unknown = await http()
          .put('/api/v1/runners/me/service-areas')
          .set(bearer(runner.token))
          .send({ areas: ['cbd', 'Mombasa'] })
          .expect(400);
        expect(unknown.body).toMatchObject({ code: 'service_area_unknown', unknown: ['Mombasa'] });
        expect((await me(runner)).serviceAreas).toEqual([{ id: 'cbd', name: 'CBD' }, { id: 'westlands', name: 'Westlands' }]);
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('RA-1, RA-2, RA-20: offer, runner projection, accept, busy', () => {
    it('lists the offer in the runner projection, accepts it, and holds the runner busy until the job leaves the active states', async () => {
      const customer = await makeUser(UserRole.CUSTOMER);
      const admin = await makeUser(UserRole.ADMIN);
      const runner = await makeUser(UserRole.RUNNER);
      const errand = await paidErrand(customer, admin);
      await assign(admin, errand.id, runner);

      const offers = await http().get('/api/v1/runners/me/offers').set(bearer(runner.token)).expect(200);
      const offer = offers.body.items.find((o: { id: string }) => o.id === errand.id);
      expect(offer).toMatchObject({
        status: 'RUNNER_ASSIGNED',
        category: 'buy_for_me',
        runnerFee: '300.00',
        itemAmount: '500.00',
        merchantRoute: 'send_to_runner',
        requiredPurchase: '500.00',
        maxPurchaseAdvance: '3000.00',
        overPurchaseLimit: false,
        offerExpiresAt: expect.any(String),
        firstPoint: { pointType: 'dropoff', addressText: 'Links Road, Nyali' },
        assignment: { status: 'assigned', decidedAt: null },
      });
      for (const k of ['feeTotal', 'quotedPrice', 'finalPrice', 'serviceFee', 'customerId']) {
        expect(offer).not.toHaveProperty(k);
      }
      expect(offers.body.nextCursor).toBeNull();
      const job = await http().get(`/api/v1/runners/me/jobs/${errand.id}`).set(bearer(runner.token)).expect(200);
      expect(job.body).toMatchObject({ id: errand.id, runnerFee: '300.00' });

      // The customer-shaped views carry no customer price for a runner.
      const detail = await http().get(`/api/v1/errands/${errand.id}`).set(bearer(runner.token)).expect(200);
      expect(detail.body).toMatchObject({ feeTotal: null, quotedPrice: null, finalPrice: null });
      await http().get(`/api/v1/errands/${errand.id}/quote`).set(bearer(runner.token)).expect(403);

      const accepted = await accept(runner, errand.id);
      expect(accepted.body.job).toMatchObject({ status: 'RUNNER_EN_ROUTE', offerExpiresAt: null, assignment: { status: 'accepted' } });
      expect(accepted.body.history).toMatchObject({ fromStatus: 'RUNNER_ASSIGNED', toStatus: 'RUNNER_EN_ROUTE' });
      expect((await me(runner)).availability).toBe('busy');
      const offline = await http()
        .patch('/api/v1/runners/me/availability')
        .set(bearer(runner.token))
        .send({ availability: 'offline' })
        .expect(409);
      expect(offline.body.code).toBe('runner_on_active_job');
      const listed = await http().get('/api/v1/runners/me/offers').set(bearer(runner.token)).expect(200);
      expect(listed.body.items.map((o: { id: string }) => o.id)).not.toContain(errand.id);
      // A busy runner is not offered another task (row 187 c).
      const other = await paidErrand(customer, admin);
      const busy = await assign(admin, other.id, runner, 409);
      expect(busy.body).toMatchObject({ code: 'runner_not_eligible', reason: 'runner_busy' });

      for (const to of ['ARRIVED', 'IN_PROGRESS']) {
        await setStatus(runner, errand.id, to);
        expect((await me(runner)).availability).toBe('busy');
      }
      const done = await setStatus(runner, errand.id, 'AWAITING_CUSTOMER');
      expect(done.body.errand).toMatchObject({ quotedPrice: null });
      expect((await me(runner)).availability).toBe('online');
    });

    it('one active job at a time (runner_busy); offline and unverified runners cannot accept', async () => {
      const customer = await makeUser(UserRole.CUSTOMER);
      const admin = await makeUser(UserRole.ADMIN);
      const runner = await makeUser(UserRole.RUNNER);
      const first = await paidErrand(customer, admin);
      const second = await paidErrand(customer, admin);
      await assign(admin, first.id, runner);
      await assign(admin, second.id, runner);
      await accept(runner, first.id);
      const busy = await accept(runner, second.id, 409);
      expect(busy.body.code).toBe('runner_busy');
      expect((await db().query('SELECT status::text AS s FROM "errands" WHERE id = $1', [second.id]))[0].s).toBe('RUNNER_ASSIGNED');

      const offline = await makeUser(UserRole.RUNNER);
      const third = await paidErrand(customer, admin);
      await assign(admin, third.id, offline);
      await http().patch('/api/v1/runners/me/availability').set(bearer(offline.token)).send({ availability: 'offline' }).expect(200);
      expect((await accept(offline, third.id, 409)).body.code).toBe('runner_offline');

      // Verification revoked after the offer (a newer rejected selfie): the
      // PATCH status accept path is gated the same way.
      await db().query(
        `INSERT INTO "runner_verifications" ("runnerProfileId", "verificationType", status, "createdAt")
         VALUES ($1, 'selfie', 'rejected', now() + interval '1 second')`,
        [offline.profileId],
      );
      const revoked = await setStatus(offline, third.id, 'RUNNER_EN_ROUTE', 403);
      expect(revoked.body.code).toBe('runner_not_verified');
    });
  });

  describe('RA-3, row 186: purchase limit; decline (rows 113, 134)', () => {
    it('refuses to assign or accept above the limit and allows the over-limit decline', async () => {
      const customer = await makeUser(UserRole.CUSTOMER);
      const admin = await makeUser(UserRole.ADMIN);
      const runner = await makeUser(UserRole.RUNNER);
      const errand = await paidErrand(customer, admin);
      await db().query(`UPDATE "runner_profiles" SET "maxPurchaseAdvance" = 100 WHERE id = $1`, [runner.profileId]);
      const refused = await assign(admin, errand.id, runner, 409);
      expect(refused.body).toMatchObject({
        code: 'runner_not_eligible',
        reason: 'over_purchase_limit',
        requiredPurchase: '500.00',
        maxPurchaseAdvance: '100.00',
      });

      await db().query(`UPDATE "runner_profiles" SET "maxPurchaseAdvance" = 3000 WHERE id = $1`, [runner.profileId]);
      await assign(admin, errand.id, runner);
      await db().query(`UPDATE "runner_profiles" SET "maxPurchaseAdvance" = 100 WHERE id = $1`, [runner.profileId]);
      const offers = await http().get('/api/v1/runners/me/offers').set(bearer(runner.token)).expect(200);
      expect(offers.body.items.find((o: { id: string }) => o.id === errand.id)).toMatchObject({ overPurchaseLimit: true });
      const over = await accept(runner, errand.id, 409);
      expect(over.body).toMatchObject({ code: 'purchase_limit_exceeded', requiredPurchase: '500.00', maxPurchaseAdvance: '100.00' });
      expect((await me(runner)).availability).toBe('online');

      const bad = await http()
        .post(`/api/v1/errands/${errand.id}/decline`)
        .set(bearer(runner.token))
        .send({ reason: 'busy' })
        .expect(400);
      expect(bad.body).toMatchObject({
        code: 'decline_reason_invalid',
        allowed: ['over_purchase_limit', 'too_far', 'not_available', 'other'],
      });
      const declined = await http()
        .post(`/api/v1/errands/${errand.id}/decline`)
        .set(bearer(runner.token))
        .send({ reason: 'over_purchase_limit' })
        .expect(200);
      expect(declined.body).toMatchObject({ status: 'declined', declineReason: 'over_purchase_limit', overLimit: true });
      expect((await db().query('SELECT status::text AS s FROM "errands" WHERE id = $1', [errand.id]))[0].s).toBe('RUNNER_ASSIGNED');
      expect((await assign(admin, errand.id, runner, 409)).body.code).toBe('runner_already_offered');
      await http().get(`/api/v1/runners/me/jobs/${errand.id}`).set(bearer(runner.token)).expect(403);
    });

    it('a decline without a reason is plain; over_purchase_limit within the limit is refused', async () => {
      const customer = await makeUser(UserRole.CUSTOMER);
      const admin = await makeUser(UserRole.ADMIN);
      const runner = await makeUser(UserRole.RUNNER);
      const errand = await paidErrand(customer, admin);
      await assign(admin, errand.id, runner);
      const within = await http()
        .post(`/api/v1/errands/${errand.id}/decline`)
        .set(bearer(runner.token))
        .send({ reason: 'over_purchase_limit' })
        .expect(409);
      expect(within.body.code).toBe('purchase_within_limit');
      const plain = await http().post(`/api/v1/errands/${errand.id}/decline`).set(bearer(runner.token)).send({}).expect(200);
      expect(plain.body).toMatchObject({ status: 'declined', declineReason: null });
      const again = await http().post(`/api/v1/errands/${errand.id}/decline`).set(bearer(runner.token)).send({}).expect(403);
      expect(again.body.statusCode).toBe(403);
    });
  });

  describe('row 185: the customer deadline', () => {
    it('refuses accept and assign after deadlineAt, then the sweep expires the task with its side effects', async () => {
      const customer = await makeUser(UserRole.CUSTOMER);
      const admin = await makeUser(UserRole.ADMIN);
      const runner = await makeUser(UserRole.RUNNER);
      const other = await makeUser(UserRole.RUNNER);
      const deadline = new Date(Date.now() + 2 * 3_600_000).toISOString();
      const errand = await paidErrand(customer, admin, { ...buyForMe, deadlineAt: deadline });
      await assign(admin, errand.id, runner);
      await db().query(`UPDATE "errands" SET "deadlineAt" = now() - interval '1 minute' WHERE id = $1`, [errand.id]);

      const late = await accept(runner, errand.id, 409);
      expect(late.body).toMatchObject({ code: 'offer_expired', reason: 'task_deadline_passed', deadlineAt: expect.any(String) });
      const listed = await http().get('/api/v1/runners/me/offers').set(bearer(runner.token)).expect(200);
      expect(listed.body.items.map((o: { id: string }) => o.id)).not.toContain(errand.id);
      const reassign = await assign(admin, errand.id, other, 409);
      expect(reassign.body.code).toBe('task_deadline_passed');
      const before = await http().get(`/api/v1/errands/${errand.id}`).set(bearer(admin.token)).expect(200);
      expect(before.body).toMatchObject({ status: 'RUNNER_ASSIGNED', deadlinePassed: true, expiry: null });

      // Scoped to this errand: the shared dev database may hold others.
      await app.get(ErrandsService).expirePastDeadline(new Date(), 100, [errand.id]);
      const after = await http().get(`/api/v1/errands/${errand.id}`).set(bearer(admin.token)).expect(200);
      expect(after.body).toMatchObject({
        status: 'EXPIRED',
        deadlinePassed: false,
        expiry: { trigger: 'deadline_passed', by: null, note: 'Customer deadline passed', at: expect.any(String) },
      });
      expect(after.body.assignments[0]).toMatchObject({ status: 'expired', decidedAt: expect.any(String) });
      const reviews: { trigger: string }[] = await db().query(
        'SELECT trigger::text AS trigger FROM "refund_reviews" WHERE "errandId" = $1',
        [errand.id],
      );
      expect(reviews.map((r) => r.trigger)).toContain('expired_after_payment');
      expect(await feedRow(customer.id, 'errand.EXPIRED', errand.id)).toMatchObject({ title: 'No runner available' });
      expect(await feedRow(admin.id, 'deadline_passed', errand.id)).toMatchObject({ title: 'Deadline passed' });

      const history = await http().get(`/api/v1/errands/${errand.id}/history`).set(bearer(admin.token)).expect(200);
      const last = history.body.at(-1);
      expect(last).toMatchObject({ toStatus: 'EXPIRED', actorType: 'system', actor: null });
      const accepted = history.body.find((h: { toStatus: string }) => h.toStatus === 'ACCEPTED');
      expect(accepted.actor).toMatchObject({ id: customer.id });
      // Customers and runners get no actor names (reviewer B2).
      const own = await http().get(`/api/v1/errands/${errand.id}/history`).set(bearer(customer.token)).expect(200);
      expect(own.body.length).toBe(history.body.length);
      for (const row of own.body as Record<string, unknown>[]) {
        expect(row).not.toHaveProperty('actor');
      }
    });

    it('a PAYMENT_CONFIRMED task past its deadline is left as is and can no longer be assigned (rows 201, 214)', async () => {
      const customer = await makeUser(UserRole.CUSTOMER);
      const admin = await makeUser(UserRole.ADMIN);
      const runner = await makeUser(UserRole.RUNNER);
      const errand = await paidErrand(customer, admin, {
        ...buyForMe,
        deadlineAt: new Date(Date.now() + 2 * 3_600_000).toISOString(),
      });
      await db().query(`UPDATE "errands" SET "deadlineAt" = now() - interval '1 minute' WHERE id = $1`, [errand.id]);
      expect(await app.get(ErrandsService).expirePastDeadline(new Date(), 100, [errand.id])).toEqual([]);
      const detail = await http().get(`/api/v1/errands/${errand.id}`).set(bearer(admin.token)).expect(200);
      expect(detail.body).toMatchObject({ status: 'PAYMENT_CONFIRMED', deadlinePassed: true });
      const refused = await assign(admin, errand.id, runner, 409);
      expect(refused.body).toMatchObject({ code: 'task_deadline_passed', deadlineAt: expect.any(String) });
      expect((await db().query('SELECT status::text AS s FROM "errands" WHERE id = $1', [errand.id]))[0].s).toBe('PAYMENT_CONFIRMED');
    });
  });
});
