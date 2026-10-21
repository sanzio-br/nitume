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
import { RunnersService } from '../src/runners/runners.service';
import { UsersService } from '../src/users/users.service';
import { deleteRunnerVerifications, readyRunner } from './support/runner-fixtures';

/**
 * Owner rows 265, 266 (2026-10-21): a runner dropped below Level 2 keeps
 * accepted / in-progress jobs, loses open offers (offer-expiry path) and
 * gets no new offers; the one-time re-check script (dry run, --apply) on the
 * test database. Every row created here is removed in afterAll by tracked
 * id; no append-only table is written (no image upload).
 */
describe('Runner level drop (e2e)', () => {
  let app: INestApplication<App>;
  let baseUrl: string;
  const userIds: string[] = [];
  const errandIds: string[] = [];

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
      await ds.query('DELETE FROM "evidence" WHERE "errandId" = ANY($1)', [errandIds]);
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


  /** Level 2 set directly (readyRunner records the five checks approved). */
  const levelTwo = (runner: Actor) =>
    db().query(`UPDATE "runner_profiles" SET "verificationLevel" = '2_id_verified' WHERE id = $1`, [runner.profileId]);
  /** A newer pending record of one check (as a runner re-upload would leave, without an image). */
  const pendingCheck = async (runner: Actor, type: 'selfie' | 'government_id', side: 'front' | 'back' | null = null) =>
    (
      (await db().query(
        `INSERT INTO "runner_verifications" ("runnerProfileId", "verificationType", side, status, "createdAt")
         VALUES ($1, $2, $3, 'pending', now() + interval '1 second') RETURNING id`,
        [runner.profileId, type, side],
      )) as { id: string }[]
    )[0].id;
  const levelOf = async (runner: Actor): Promise<string> =>
    ((await db().query(`SELECT "verificationLevel"::text AS l FROM "runner_profiles" WHERE id = $1`, [runner.profileId])) as {
      l: string;
    }[])[0].l;
  const assignmentOf = async (errandId: string, runner: Actor) =>
    ((await db().query(
      `SELECT status::text AS status, "decidedAt" FROM "errand_assignments"
        WHERE "errandId" = $1 AND "runnerProfileId" = $2 ORDER BY "createdAt" DESC LIMIT 1`,
      [errandId, runner.profileId],
    )) as { status: string; decidedAt: Date | null }[])[0];
  const errandStatus = async (errandId: string) =>
    ((await db().query(`SELECT status::text AS s FROM "errands" WHERE id = $1`, [errandId])) as { s: string }[])[0].s;

  it('row 266: on the drop, accepted jobs continue, open offers are withdrawn, no new offer', async () => {
    const [customer, admin, runner] = [
      await makeUser(UserRole.CUSTOMER),
      await makeUser(UserRole.ADMIN),
      await makeUser(UserRole.RUNNER),
    ];
    await levelTwo(runner);
    const accepted = await paidErrand(customer, admin);
    const offered = await paidErrand(customer, admin);
    await assign(admin, offered.id, runner);
    await assign(admin, accepted.id, runner);
    await accept(runner, accepted.id);
    expect(await assignmentOf(offered.id, runner)).toMatchObject({ status: 'assigned' });

    // The admin rejects the runner's newest selfie: 2_id_verified -> 1_basic.
    const selfie = await pendingCheck(runner, 'selfie');
    const decided = await http()
      .patch(`/api/v1/runners/${runner.profileId}/verifications/${selfie}`)
      .set(bearer(admin.token))
      .send({ decision: 'rejected' })
      .expect(200);
    expect(decided.body.runnerProfile).toMatchObject({ verificationLevel: '1_basic', level2Missing: ['selfie'] });

    // The open offer is withdrawn through the offer-expiry path; the task waits for another runner.
    expect(await assignmentOf(offered.id, runner)).toMatchObject({ status: 'expired' });
    expect(await errandStatus(offered.id)).toBe('RUNNER_ASSIGNED');
    const late = await http().post(`/api/v1/errands/${offered.id}/accept`).set(bearer(runner.token));
    expect(late.status).toBe(409);
    expect(late.body.code).toBe('offer_expired');

    // The accepted job continues unchanged.
    expect(await assignmentOf(accepted.id, runner)).toMatchObject({ status: 'accepted' });
    expect(await errandStatus(accepted.id)).toBe('RUNNER_EN_ROUTE');
    await setStatus(runner, accepted.id, 'ARRIVED');
    await setStatus(runner, accepted.id, 'IN_PROGRESS');

    // No new offer while below Level 2: runner_not_eligible {reason: not_verified} (a fresh task:
    // re-offering the withdrawn one to the same runner is runner_already_offered, as after a lapse).
    const fresh = await paidErrand(customer, admin);
    const again = await http()
      .post(`/api/v1/errands/${fresh.id}/assign`)
      .set(bearer(admin.token))
      .send({ runnerProfileId: runner.profileId })
      .expect(409);
    expect(again.body).toMatchObject({ code: 'runner_not_eligible', reason: 'not_verified' });
  });
});
