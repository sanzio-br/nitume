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
 * Owner answers round 12 (rows 201-218, 2026-10-19), unblocked items:
 * assign refused past the deadline (201, 214), offers capped at the
 * deadline (205), decline reasons (210), the candidates read with offline
 * runners flagged and an online-only count (204, 215), and the admin
 * "Expire task — no runner available" (187, 202, 203, 208). Each test uses
 * its own service area (config spy) around its own task point, so runners
 * from other tests are never in its pool. No row goes into an append-only
 * table (row 198); every row is removed in afterAll by tracked id.
 */
describe('Owner answers round 12 (e2e)', () => {
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

  /** A ready runner with the buy_for_me skill in `area`. */
  const poolRunner = async (area: string, name: string) => {
    const runner = await makeUser(UserRole.RUNNER, name);
    await http().put('/api/v1/runners/me/skills').set(bearer(runner.token)).send({ skills: ['buy_for_me'] }).expect(200);
    await http().put('/api/v1/runners/me/service-areas').set(bearer(runner.token)).send({ areas: [area] }).expect(200);
    return runner;
  };

  const setAvailability = (runner: Actor, availability: 'online' | 'offline' | 'busy') =>
    db().query(`UPDATE "runner_profiles" SET availability = $2 WHERE id = $1`, [runner.profileId, availability]);

  const at = (point: { lat: number; lng: number }) => ({
    ...buyForMe,
    locations: [{ pointType: 'dropoff', lat: point.lat, lon: point.lng, addressText: 'Test point' }],
  });

  const candidates = (admin: Actor, errandId: string, expected = 200, query: Record<string, unknown> = {}) =>
    http().get(`/api/v1/errands/${errandId}/candidates`).query(query).set(bearer(admin.token)).expect(expected);

  const detail = async (admin: Actor, errandId: string) =>
    (await http().get(`/api/v1/errands/${errandId}`).set(bearer(admin.token)).expect(200)).body as Record<string, unknown>;

  const expire = (admin: Actor, errandId: string, body: Record<string, unknown>, expected: number) =>
    http().post(`/api/v1/errands/${errandId}/expire`).set(bearer(admin.token)).send(body).expect(expected);

  describe('rows 201, 205, 214: deadline on assign and offers', () => {
    it('caps a new offer at the task deadline and refuses assign once the deadline passed', async () => {
      const customer = await makeUser(UserRole.CUSTOMER);
      const admin = await makeUser(UserRole.ADMIN);
      const runner = await makeUser(UserRole.RUNNER);
      const errand = await paidErrand(customer, admin, { ...buyForMe, deadlineAt: new Date(Date.now() + 2 * 3_600_000).toISOString() });
      // Three minutes left: shorter than the 10-minute admin window.
      await db().query(`UPDATE "errands" SET "deadlineAt" = date_trunc('second', now()) + interval '3 minutes' WHERE id = $1`, [errand.id]);
      const [{ deadline }] = await db().query(`SELECT "deadlineAt" AS deadline FROM "errands" WHERE id = $1`, [errand.id]);
      const offered = await assign(admin, errand.id, runner);
      expect(new Date(offered.body.assignment.offerExpiresAt).getTime()).toBe(new Date(deadline).getTime());

      const late = await paidErrand(customer, admin, { ...buyForMe, deadlineAt: new Date(Date.now() + 2 * 3_600_000).toISOString() });
      await db().query(`UPDATE "errands" SET "deadlineAt" = now() - interval '1 minute' WHERE id = $1`, [late.id]);
      const refused = await assign(admin, late.id, runner, 409);
      expect(refused.body).toMatchObject({ code: 'task_deadline_passed', deadlineAt: expect.any(String) });
      expect((await detail(admin, late.id)).status).toBe('PAYMENT_CONFIRMED');
    });
  });

  describe('row 210: decline reasons', () => {
    it('stores too_far, not_available and other; the ops feed gets the row-216 body; the legacy route stays over-limit only', async () => {
      const customer = await makeUser(UserRole.CUSTOMER);
      const admin = await makeUser(UserRole.ADMIN);
      for (const reason of ['too_far', 'not_available', 'other']) {
        const runner = await makeUser(UserRole.RUNNER);
        const errand = await paidErrand(customer, admin);
        await assign(admin, errand.id, runner);
        const legacy = await http()
          .post(`/api/v1/errands/${errand.id}/assignment/decline`)
          .set(bearer(runner.token))
          .send({ reason })
          .expect(400);
        expect(legacy.body.statusCode).toBe(400);
        const declined = await http()
          .post(`/api/v1/errands/${errand.id}/decline`)
          .set(bearer(runner.token))
          .send({ reason })
          .expect(200);
        expect(declined.body).toMatchObject({ status: 'declined', declineReason: reason, overLimit: false });
        const view = await detail(admin, errand.id);
        expect((view.lastAssignment as Record<string, unknown>).declineReason).toBe(reason);
        expect(await feedRow(admin.id, 'assignment.declined', errand.id)).toMatchObject({
          title: 'Runner declined a task',
          body: `The runner declined ${String(view.reference)}. Assign another runner.`,
        });
      }
    });
  });

  describe('rows 204, 215: candidates read', () => {
    it('lists the pool with offline runners flagged; only online, untried, within-limit runners count', async () => {
      const point = { lat: -3.95, lng: 39.75 };
      onlyArea('oa12-cand', point);
      const customer = await makeUser(UserRole.CUSTOMER);
      const admin = await makeUser(UserRole.ADMIN);
      const online = await poolRunner('oa12-cand', 'Online Runner');
      const offline = await poolRunner('oa12-cand', 'Offline Runner');
      const poor = await poolRunner('oa12-cand', 'Poor Runner');
      const busy = await poolRunner('oa12-cand', 'Busy Runner');
      const elsewhere = await makeUser(UserRole.RUNNER, 'No Skill Runner');
      await setAvailability(offline, 'offline');
      await setAvailability(busy, 'busy');
      await db().query(`UPDATE "runner_profiles" SET "maxPurchaseAdvance" = 100 WHERE id = $1`, [poor.profileId]);
      const errand = await paidErrand(customer, admin, at(point));

      const page = await candidates(admin, errand.id);
      expect(page.body).toMatchObject({ eligibleRemaining: 1, offlineCount: 1, triedCount: 0, requiredPurchase: '500.00', nextCursor: null });
      const ids = (page.body.items as { runnerProfileId: string }[]).map((c) => c.runnerProfileId);
      // Online, untried, within the limit first; offline last.
      expect(ids).toEqual([online.profileId, poor.profileId, offline.profileId]);
      expect(ids).not.toContain(busy.profileId);
      expect(ids).not.toContain(elsewhere.profileId);
      const byId = Object.fromEntries((page.body.items as { runnerProfileId: string }[]).map((c) => [c.runnerProfileId, c]));
      expect(byId[online.profileId as string]).toMatchObject({
        displayName: 'Online Runner',
        offline: false,
        availability: 'online',
        tried: null,
        ineligibleReason: null,
        purchaseLimit: '3000.00',
      });
      expect(byId[offline.profileId as string]).toMatchObject({ offline: true, availability: 'offline' });
      expect(byId[poor.profileId as string]).toMatchObject({ ineligibleReason: 'over_purchase_limit', purchaseLimit: '100.00' });

      // Row 215: an admin may still offer it to the offline runner.
      await assign(admin, errand.id, offline);
      const withOffer = await candidates(admin, errand.id);
      expect((withOffer.body.items as { runnerProfileId: string }[]).map((c) => c.runnerProfileId)).not.toContain(offline.profileId);
      await http().post(`/api/v1/errands/${errand.id}/decline`).set(bearer(offline.token)).send({ reason: 'not_available' }).expect(200);
      const after = await candidates(admin, errand.id, 200, { limit: 1 });
      expect(after.body).toMatchObject({ eligibleRemaining: 1, offlineCount: 0, triedCount: 1 });
      expect(after.body.items).toHaveLength(1);
      expect(after.body.items[0].runnerProfileId).toBe(online.profileId);
      const next = await candidates(admin, errand.id, 200, { limit: 1, cursor: after.body.nextCursor });
      expect(next.body.items[0].runnerProfileId).toBe(poor.profileId);
      const last = await candidates(admin, errand.id, 200, { limit: 1, cursor: next.body.nextCursor });
      expect(last.body.items[0]).toMatchObject({ runnerProfileId: offline.profileId, tried: 'declined', offline: true });
      expect(last.body.nextCursor).toBeNull();

      expect((await candidates(admin, errand.id, 400, { cursor: 'nope' })).body.code).toBe('cursor_invalid');
      await http().get(`/api/v1/errands/${errand.id}/candidates`).set(bearer(customer.token)).expect(403);
      // A read never moves the task.
      expect((await detail(admin, errand.id)).status).toBe('RUNNER_ASSIGNED');
    });
  });

  describe('rows 187, 202, 203, 208: Expire task — no runner available', () => {
    it('is offered and allowed only with no open offer and no eligible online runner left; records the admin and the reason', async () => {
      const point = { lat: -3.85, lng: 39.8 };
      onlyArea('oa12-exp', point);
      const customer = await makeUser(UserRole.CUSTOMER);
      const admin = await makeUser(UserRole.ADMIN, 'Ops Wanjiru');
      const first = await poolRunner('oa12-exp', 'First Runner');
      const second = await poolRunner('oa12-exp', 'Second Runner');
      const errand = await paidErrand(customer, admin, at(point));
      expect((await detail(admin, errand.id)).canExpire).toEqual({ noRunner: false, deadlinePassed: false });
      const paidOnly = await expire(admin, errand.id, { reason: 'No runner covers this area.' }, 409);
      // Round 13 (rows 201, 225): a PAYMENT_CONFIRMED task can be expired, but only after its deadline.
      expect(paidOnly.body).toMatchObject({ code: 'expiry_not_allowed', reason: 'deadline_not_passed' });

      await assign(admin, errand.id, first);
      expect((await detail(admin, errand.id)).canExpire).toEqual({ noRunner: false, deadlinePassed: false });
      expect((await expire(admin, errand.id, { reason: 'No runner covers this area.' }, 409)).body.reason).toBe('open_offer');

      await http().post(`/api/v1/errands/${errand.id}/decline`).set(bearer(first.token)).send({ reason: 'too_far' }).expect(200);
      const remain = await expire(admin, errand.id, { reason: 'No runner covers this area.' }, 409);
      expect(remain.body).toMatchObject({ reason: 'eligible_runners_remain', eligibleRemaining: 1 });
      expect((await detail(admin, errand.id)).canExpire).toEqual({ noRunner: false, deadlinePassed: false });

      // Row 204: an offline runner does not hold the task open.
      await setAvailability(second, 'offline');
      expect((await detail(admin, errand.id)).canExpire).toEqual({ noRunner: true, deadlinePassed: false });

      // The generic status route cannot do it for an admin.
      const generic = await http()
        .patch(`/api/v1/errands/${errand.id}/status`)
        .set(bearer(admin.token))
        .send({ to: 'EXPIRED', note: 'No runner covers this area.' })
        .expect(409);
      expect(generic.body.code).toBe('transition_requires_admin_expiry');
      await expire(customer, errand.id, { reason: 'No runner covers this area.' }, 403);
      const short = await expire(admin, errand.id, { reason: '   too short  ' }, 400);
      expect(short.body).toMatchObject({ code: 'expiry_reason_invalid', minLength: 10, maxLength: 500 });
      expect((await expire(admin, errand.id, {}, 400)).body.code).toBe('expiry_reason_invalid');

      const done = await expire(admin, errand.id, { reason: '  No runner covers Nyali on Sundays.  ' }, 200);
      expect(done.body.errand.status).toBe('EXPIRED');
      expect(done.body.history).toMatchObject({
        fromStatus: 'RUNNER_ASSIGNED',
        toStatus: 'EXPIRED',
        actorType: 'admin',
        actorId: admin.id,
        note: 'No runner covers Nyali on Sundays.',
      });
      const view = await detail(admin, errand.id);
      expect(view).toMatchObject({
        status: 'EXPIRED',
        canExpire: { noRunner: false, deadlinePassed: false },
        expiry: {
          trigger: 'admin',
          fromStatus: 'RUNNER_ASSIGNED',
          by: { id: admin.id, displayName: 'Ops Wanjiru' },
          note: 'No runner covers Nyali on Sundays.',
        },
      });
      const reviews: { trigger: string }[] = await db().query(
        'SELECT trigger::text AS trigger FROM "refund_reviews" WHERE "errandId" = $1',
        [errand.id],
      );
      expect(reviews.map((r) => r.trigger)).toContain('expired_after_payment');
      expect(await feedRow(customer.id, 'errand.EXPIRED', errand.id)).toMatchObject({ title: 'No runner available' });
      expect((await candidates(admin, errand.id, 409)).body).toMatchObject({ code: 'task_not_assignable', status: 'EXPIRED' });
      expect((await expire(admin, errand.id, { reason: 'No runner covers this area.' }, 409)).body.reason).toBe('not_expirable');
    });

    it('is refused after the deadline (the sweep expires it)', async () => {
      const point = { lat: -3.75, lng: 39.85 };
      onlyArea('oa12-late', point);
      const customer = await makeUser(UserRole.CUSTOMER);
      const admin = await makeUser(UserRole.ADMIN);
      const runner = await poolRunner('oa12-late', 'Late Runner');
      const errand = await paidErrand(customer, admin, { ...at(point), deadlineAt: new Date(Date.now() + 2 * 3_600_000).toISOString() });
      await assign(admin, errand.id, runner);
      await http().post(`/api/v1/errands/${errand.id}/decline`).set(bearer(runner.token)).send({ reason: 'other' }).expect(200);
      expect((await detail(admin, errand.id)).canExpire).toEqual({ noRunner: true, deadlinePassed: false });
      await db().query(`UPDATE "errands" SET "deadlineAt" = now() - interval '1 minute' WHERE id = $1`, [errand.id]);
      expect((await detail(admin, errand.id)).canExpire).toEqual({ noRunner: false, deadlinePassed: false });
      expect((await expire(admin, errand.id, { reason: 'No runner covers this area.' }, 409)).body.reason).toBe('deadline_passed');
    });
  });
});
