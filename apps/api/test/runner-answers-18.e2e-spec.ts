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
import { applyEvidenceBodyLimit } from '../src/evidence/evidence-upload';
import { RunnersService } from '../src/runners/runners.service';
import { LocationRetentionService } from '../src/scheduler/location-retention.service';
import { UsersService } from '../src/users/users.service';
import { deleteRunnerVerifications, readyRunner } from './support/runner-fixtures';
import { TestSocket, connectSocket } from './support/socket-client';

/**
 * Owner answers round 18, runner side (rows 247, 248, 252, 254; 2026-10-20):
 * - 247: job location samples are deleted 90 days after the task ends,
 *   never while a dispute on it is open (purge run with a shifted clock).
 * - 248: an approved send_to_runner increase waits for the difference; the
 *   runner's buy ceiling stays at the old amount until it is paid.
 * - 252: the evidence route accepts files up to EVIDENCE_MAX_UPLOAD_BYTES
 *   (1 MiB here), other routes keep the default body limit.
 * - 254: receipts while DISPUTED; photos refused.
 * The only rows inserted directly are one dispute (row 247 hold) and the
 * location samples; every row is removed in afterAll by tracked id. No
 * append-only table is written.
 */
describe('Runner answers round 18 (e2e)', () => {
  let app: INestApplication<App>;
  let baseUrl: string;
  const userIds: string[] = [];
  const errandIds: string[] = [];
  const sockets: TestSocket[] = [];

  const MAX_BYTES = 1024 * 1024;
  process.env.EVIDENCE_MAX_UPLOAD_BYTES = String(MAX_BYTES);

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
    // As main.ts (row 252): before init, so it runs ahead of the default parser.
    applyEvidenceBodyLimit(app, app.get(ConfigService), 'api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    for (const s of sockets) {
      s.close();
    }
    delete process.env.EVIDENCE_MAX_UPLOAD_BYTES;
    const ds = app.get(DataSource);
    await sleep(500);
    if (errandIds.length > 0) {
      await ds.query(
        `DELETE FROM "payment_transactions" WHERE "paymentId" IN
           (SELECT id FROM "payments" WHERE "errandId" = ANY($1))`,
        [errandIds],
      );
      await ds.query('DELETE FROM "payments" WHERE "errandId" = ANY($1)', [errandIds]);
      await ds.query('DELETE FROM "refund_reviews" WHERE "errandId" = ANY($1)', [errandIds]);
      await ds.query('DELETE FROM "disputes" WHERE "errandId" = ANY($1)', [errandIds]);
      for (const table of [
        'evidence',
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
  const buyForMe = {
    category: 'buy_for_me',
    description: 'Buy a gas refill',
    budget: 500,
    locations: [{ pointType: 'dropoff', lat: SITE.lat, lon: SITE.lng, addressText: 'Links Road, Nyali' }],
  };

  const setStatus = (actor: Actor, errandId: string, to: string, expected = 200) =>
    http().patch(`/api/v1/errands/${errandId}/status`).set(bearer(actor.token)).send({ to }).expect(expected);

  /** A send_to_runner Buy For Me task, paid, accepted by `runner`, moved on to `to`. */
  const job = async (customer: Actor, admin: Actor, runner: Actor, to: 'RUNNER_EN_ROUTE' | 'IN_PROGRESS') => {
    const res = await http().post('/api/v1/errands').set(bearer(customer.token)).send(buyForMe).expect(201);
    const id = res.body.errand.id as string;
    errandIds.push(id);
    await http().post(`/api/v1/errands/${id}/submit`).set(bearer(customer.token)).expect(201);
    await http()
      .post(`/api/v1/errands/${id}/quote`)
      .set(bearer(admin.token))
      .send({ total: 1000, baseFee: 600, distanceFee: 400 })
      .expect(201);
    await setStatus(customer, id, 'ACCEPTED');
    const init = await http()
      .post(`/api/v1/payments/${id}/initiate`)
      .set(bearer(customer.token))
      .send({ merchantRoute: 'send_to_runner' })
      .expect(201);
    await http().post('/api/v1/payments/mpesa/callback').send({ reference: init.body.reference, resultCode: 0 }).expect(201);
    await http().post(`/api/v1/errands/${id}/assign`).set(bearer(admin.token)).send({ runnerProfileId: runner.profileId }).expect(201);
    await http().post(`/api/v1/errands/${id}/accept`).set(bearer(runner.token)).expect(200);
    if (to === 'IN_PROGRESS') {
      await setStatus(runner, id, 'ARRIVED');
      await setStatus(runner, id, 'IN_PROGRESS');
    }
    return id;
  };

  const runnerJob = async (runner: Actor, errandId: string) =>
    (await http().get(`/api/v1/runners/me/jobs/${errandId}`).set(bearer(runner.token)).expect(200)).body as Record<string, unknown>;

  const image = (bytes: number) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(bytes - 3, 1)]).toString('base64');

  const upload = (runner: Actor, errandId: string, type: 'photo' | 'receipt', bytes = 1024) =>
    http()
      .post(`/api/v1/errands/${errandId}/evidence`)
      .set(bearer(runner.token))
      .send({ type, contentType: 'image/jpeg', data: image(bytes) });

  describe('row 248: approved increase waiting for the difference', () => {
    it('keeps the buy ceiling at the old amount until the difference is paid, then tells the runner', async () => {
      const [customer, admin, runner] = [await makeUser(UserRole.CUSTOMER), await makeUser(UserRole.ADMIN), await makeUser(UserRole.RUNNER)];
      const id = await job(customer, admin, runner, 'IN_PROGRESS');
      expect(await runnerJob(runner, id)).toMatchObject({ itemAmount: '500.00', requiredPurchase: '500.00', differenceAwaitingPayment: null });

      const runnerSocket = await connectSocket(baseUrl, runner.token);
      sockets.push(runnerSocket);
      const req = await http()
        .post(`/api/v1/errands/${id}/price-change`)
        .set(bearer(runner.token))
        .send({ toPrice: 650, reason: 'The shop raised the price' })
        .expect(201);
      const approved = await http()
        .post(`/api/v1/errands/${id}/price-change/${req.body.id}/approve`)
        .set(bearer(customer.token))
        .send({})
        .expect(201);

      // Approved, not paid: new item amount, old ceiling, the waiting state.
      expect(await runnerJob(runner, id)).toMatchObject({
        itemAmount: '650.00',
        requiredPurchase: '500.00',
        differenceAwaitingPayment: { amount: '150.00', priceChangeRequestIds: [req.body.id] },
      });

      await http()
        .post('/api/v1/payments/mpesa/callback')
        .send({ reference: approved.body.differencePayment.transactions[0].mpesaReference, resultCode: 0 })
        .expect(201);
      await expect(
        runnerSocket.waitFor<Record<string, unknown>>('price_change:difference_paid', (d) => d.errandId === id),
      ).resolves.toEqual({ errandId: id, requestId: req.body.id, amount: '150.00', paidAt: expect.any(String) });
      expect(await runnerJob(runner, id)).toMatchObject({
        itemAmount: '650.00',
        requiredPurchase: '650.00',
        differenceAwaitingPayment: null,
      });
    });
  });

  describe('rows 252 and 254: evidence size and DISPUTED', () => {
    it('accepts a file up to the limit and refuses larger ones with 413 evidence_too_large', async () => {
      const [customer, admin, runner] = [await makeUser(UserRole.CUSTOMER), await makeUser(UserRole.ADMIN), await makeUser(UserRole.RUNNER)];
      const id = await job(customer, admin, runner, 'IN_PROGRESS');
      // Far above the default 100 kB body limit.
      await upload(runner, id, 'photo', 900 * 1024).expect(201);
      // Just over the file limit, inside the route's body limit: the service refuses.
      const over = await upload(runner, id, 'photo', MAX_BYTES + 10 * 1024).expect(413);
      expect(over.body).toMatchObject({ statusCode: 413, code: 'evidence_too_large', maxBytes: MAX_BYTES });
      // Far over: the route's body parser refuses, same code.
      const far = await upload(runner, id, 'photo', 2 * MAX_BYTES).expect(413);
      expect(far.body).toMatchObject({ statusCode: 413, code: 'evidence_too_large', maxBytes: MAX_BYTES });
      // Other routes keep the default limit.
      const big = await http()
        .patch(`/api/v1/errands/${id}/runner-notes`)
        .set(bearer(runner.token))
        .send({ runnerNotes: 'x'.repeat(200 * 1024) })
        .expect(413);
      expect(big.body.code).not.toBe('evidence_too_large');
    });

    it('row 254: while DISPUTED a receipt is accepted, a photo refused', async () => {
      const [customer, admin, runner] = [await makeUser(UserRole.CUSTOMER), await makeUser(UserRole.ADMIN), await makeUser(UserRole.RUNNER)];
      const id = await job(customer, admin, runner, 'IN_PROGRESS');
      await setStatus(customer, id, 'DISPUTED');
      await upload(runner, id, 'receipt').expect(201);
      const photo = await upload(runner, id, 'photo').expect(409);
      expect(photo.body).toMatchObject({ code: 'evidence_not_allowed', status: 'DISPUTED', type: 'photo' });
    });
  });

  describe('row 247: job location retention', () => {
    it('deletes samples 90 days after the task ends, keeps them for live tasks and open disputes', async () => {
      const [customer, admin] = [await makeUser(UserRole.CUSTOMER), await makeUser(UserRole.ADMIN)];
      // One job per runner (a busy runner is not offered another, row 187).
      const [r1, r2, r3] = [await makeUser(UserRole.RUNNER), await makeUser(UserRole.RUNNER), await makeUser(UserRole.RUNNER)];
      const ended = await job(customer, admin, r1, 'RUNNER_EN_ROUTE');
      const held = await job(customer, admin, r2, 'RUNNER_EN_ROUTE');
      const live = await job(customer, admin, r3, 'RUNNER_EN_ROUTE');
      const runners = app.get(RunnersService);
      for (const [runner, errandId] of [[r1, ended], [r2, held], [r3, live]] as const) {
        await runners.recordPing({ runnerProfileId: runner.profileId as string, errandId, lat: -4.05, lng: 39.69, capturedAt: new Date(), trail: true });
      }
      await setStatus(r1, ended, 'FAILED');
      await setStatus(r2, held, 'FAILED');
      // A dispute still open on an ended task holds its samples (row 247).
      await db().query(`INSERT INTO "disputes" ("errandId", "openedBy", "reason", "status") VALUES ($1, $2, $3, 'open')`, [
        held,
        customer.id,
        'Retention hold test',
      ]);
      const count = async (errandId: string) =>
        Number((await db().query('SELECT COUNT(*) AS n FROM "runner_locations" WHERE "errandId" = $1', [errandId]))[0].n);
      const retention = app.get(LocationRetentionService);
      const day = 86_400_000;

      await retention.purgeExpired(new Date(Date.now() + 89 * day));
      expect([await count(ended), await count(held), await count(live)]).toEqual([1, 1, 1]);

      const out = await retention.purgeExpired(new Date(Date.now() + 91 * day));
      expect(out.errandIds).toContain(ended);
      expect(out.errandIds).not.toContain(held);
      expect(out.errandIds).not.toContain(live);
      expect([await count(ended), await count(held), await count(live)]).toEqual([0, 1, 1]);
    });
  });
});
