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
 * v-active contract (gap report §21, A1 A2 A4 A5 A6 A10): held jobs read,
 * the job view after the end (403 job_not_held), runner evidence guards,
 * the completion photo guard, Idempotency-Key replays on transitions,
 * notes and evidence, and the row-129 receipt/claim window. Every row
 * created here is removed in afterAll by tracked id; no append-only table
 * is written (claims are refused before any ledger line).
 */
describe('Runner active job API (e2e)', () => {
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


  const evidence = (runner: Actor, errandId: string, type: string, key?: string, contentType = 'image/jpeg') => {
    const req = http().post(`/api/v1/errands/${errandId}/evidence`).set(bearer(runner.token));
    if (key) {
      req.set('Idempotency-Key', key);
    }
    return req.send({ type, contentType, data: Buffer.from(`${type}-bytes-${key ?? ''}`).toString('base64') });
  };

  const held = async (runner: Actor) =>
    ((await http().get('/api/v1/runners/me/jobs').set(bearer(runner.token)).expect(200)).body as { items: { id: string; status: string }[] }).items;

  /** Moves the history row that ended the task back in time (the test's clock for the 24 h window). */
  const endedHoursAgo = (errandId: string, hours: number) =>
    db().query(
      `UPDATE "errand_status_history" SET "createdAt" = now() - make_interval(hours => $2)
        WHERE "errandId" = $1 AND "toStatus" IN ('CANCELLED', 'FAILED')`,
      [errandId, hours],
    );

  it('A1/A2: held jobs, the job after the end, and job_not_held', async () => {
    const [customer, admin, runner, other] = [
      await makeUser(UserRole.CUSTOMER),
      await makeUser(UserRole.ADMIN),
      await makeUser(UserRole.RUNNER),
      await makeUser(UserRole.RUNNER),
    ];
    const accepted = await paidErrand(customer, admin);
    const offered = await paidErrand(customer, admin);
    // Offer first: a busy runner is not offered anything (row 187 c).
    await assign(admin, offered.id, runner);
    await assign(admin, accepted.id, runner);
    await accept(runner, accepted.id);

    const list = await held(runner);
    expect(list.map((j) => j.id)).toEqual([accepted.id]);
    expect(list[0]).toMatchObject({ status: 'RUNNER_EN_ROUTE', assignment: { status: 'accepted' } });
    expect(list[0]).not.toHaveProperty('feeTotal');

    const notMine = await http().get(`/api/v1/runners/me/jobs/${accepted.id}`).set(bearer(other.token)).expect(403);
    expect(notMine.body.code).toBe('job_not_held');

    await setStatus(runner, accepted.id, 'FAILED');
    const after = await http().get(`/api/v1/runners/me/jobs/${accepted.id}`).set(bearer(runner.token)).expect(200);
    expect(after.body).toMatchObject({ id: accepted.id, status: 'FAILED' });
    expect((await held(runner)).map((j) => j.id)).toEqual([accepted.id]);
    await endedHoursAgo(accepted.id, 25);
    expect(await held(runner)).toEqual([]);
  });

  it('A4/A5/A6: evidence guards, the completion photo, Idempotency-Key replays', async () => {
    const [customer, admin, runner] = [await makeUser(UserRole.CUSTOMER), await makeUser(UserRole.ADMIN), await makeUser(UserRole.RUNNER)];
    const errand = await paidErrand(customer, admin);
    await assign(admin, errand.id, runner);
    await accept(runner, errand.id);

    const early = await evidence(runner, errand.id, 'photo').expect(409);
    expect(early.body).toMatchObject({ code: 'evidence_not_allowed', status: 'RUNNER_EN_ROUTE', type: 'photo' });

    // Transition replay: one ARRIVED row, the same answer twice.
    const arrive = () =>
      http().patch(`/api/v1/errands/${errand.id}/status`).set(bearer(runner.token)).set('Idempotency-Key', 'q-arrive').send({ to: 'ARRIVED' });
    const first = await arrive().expect(200);
    const replay = await arrive().expect(200);
    expect(replay.headers['idempotent-replay']).toBe('true');
    expect(replay.body.history.id).toBe(first.body.history.id);
    const reused = await http()
      .patch(`/api/v1/errands/${errand.id}/status`)
      .set(bearer(runner.token))
      .set('Idempotency-Key', 'q-arrive')
      .send({ to: 'IN_PROGRESS' })
      .expect(409);
    expect(reused.body.code).toBe('idempotency_key_reused');
    await setStatus(runner, errand.id, 'IN_PROGRESS');
    const history: { toStatus: string }[] = (await http().get(`/api/v1/errands/${errand.id}/history`).set(bearer(runner.token)).expect(200)).body;
    expect(history.filter((h) => h.toStatus === 'ARRIVED')).toHaveLength(1);

    const missing = await setStatus(runner, errand.id, 'AWAITING_CUSTOMER', 409);
    expect(missing.body).toMatchObject({ code: 'evidence_required', missing: ['photo'] });

    const video = await evidence(runner, errand.id, 'video', undefined, 'video/mp4').expect(400);
    expect(video.body.code).toBe('evidence_type_not_allowed');

    // Evidence replay: one row.
    const p1 = await evidence(runner, errand.id, 'photo', 'q-photo-1').expect(201);
    const p2 = await evidence(runner, errand.id, 'photo', 'q-photo-1').expect(201);
    expect(p2.body.id).toBe(p1.body.id);
    const rows: unknown[] = await db().query('SELECT id FROM "evidence" WHERE "errandId" = $1', [errand.id]);
    expect(rows).toHaveLength(1);

    // Notes replay.
    const notes = () =>
      http()
        .patch(`/api/v1/errands/${errand.id}/runner-notes`)
        .set(bearer(runner.token))
        .set('Idempotency-Key', 'q-notes-1')
        .send({ runnerNotes: 'Checked every room.' });
    await notes().expect(200);
    expect((await notes().expect(200)).body.runnerNotes).toBe('Checked every room.');

    await setStatus(runner, errand.id, 'AWAITING_CUSTOMER');
    expect((await evidence(runner, errand.id, 'photo').expect(409)).body.code).toBe('evidence_not_allowed');
    await evidence(runner, errand.id, 'receipt').expect(201);
    // RA-6 / A9: the customer's confirm reaches the runner's feed.
    await setStatus(customer, errand.id, 'COMPLETED');
    let row: { title: string; body: string } | undefined;
    for (let i = 0; i < 40 && !row; i += 1) {
      [row] = (await db().query(
        `SELECT title, body FROM "notifications" WHERE "userId" = $1 AND "errandId" = $2 AND "eventType" = 'errand.COMPLETED'`,
        [runner.id, errand.id],
      )) as { title: string; body: string }[];
      if (!row) {
        await sleep(250);
      }
    }
    expect(row).toEqual({
      title: 'Customer confirmed the job',
      body: 'Check It For Me. Your runner fee becomes payable when the review window closes.',
    });
  });

  it('A10: receipts and claims within 24 h after FAILED, then reimbursement_window_closed', async () => {
    const [customer, admin, runner] = [await makeUser(UserRole.CUSTOMER), await makeUser(UserRole.ADMIN), await makeUser(UserRole.RUNNER)];
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
    await setStatus(runner, errand.id, 'FAILED');
    const receipt = await evidence(runner, errand.id, 'receipt').expect(201);
    expect((await evidence(runner, errand.id, 'photo').expect(409)).body.code).toBe('evidence_not_allowed');

    await endedHoursAgo(errand.id, 25);
    const late = await evidence(runner, errand.id, 'receipt').expect(409);
    expect(late.body).toMatchObject({ code: 'reimbursement_window_closed', endedAt: expect.any(String), windowEndsAt: expect.any(String) });
    const claim = await http()
      .post('/api/v1/runners/me/reimbursement-claims')
      .set(bearer(runner.token))
      .send({ errandId: errand.id, amount: 400, receiptEvidenceId: receipt.body.id })
      .expect(409);
    expect(claim.body.code).toBe('reimbursement_window_closed');
    const lines: unknown[] = await db().query('SELECT id FROM "runner_payout_lines" WHERE "errandId" = $1', [errand.id]);
    expect(lines).toEqual([]);
  });
});
