import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ErrandStatus, StatusHistoryActor, UserRole } from '../src/common/enums';
import { ErrandsService } from '../src/errands/errands.service';
import { CustomersService } from '../src/customers/customers.service';
import { RunnersService } from '../src/runners/runners.service';
import { UsersService } from '../src/users/users.service';

/**
 * Contract checks for the owner answers 9 (BOARD rows 161-166 and the
 * round-8 review minors): payout request audit columns and the ops cancel,
 * the ID image retention clock and purge, upload checks. Every row created
 * here is removed in afterAll.
 */
describe('Owner answers 9 (e2e)', () => {
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

  const makeUser = async (role: UserRole, displayName?: string): Promise<Actor> => {
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
      // Overrides reference refund reviews and runner lines (row 136).
      await ds.query('ALTER TABLE "task_exposure_overrides" DISABLE TRIGGER USER');
      await ds.query('DELETE FROM "task_exposure_overrides" WHERE "errandId" = ANY($1)', [errandIds]);
      await ds.query('ALTER TABLE "task_exposure_overrides" ENABLE TRIGGER USER');
      // Corrections are append-only (DB trigger): lift it for the cleanup only.
      await ds.query('ALTER TABLE "refund_payout_corrections" DISABLE TRIGGER USER');
      await ds.query(
        `DELETE FROM "refund_payout_corrections" WHERE "refundReviewId" IN
           (SELECT id FROM "refund_reviews" WHERE "errandId" = ANY($1))`,
        [errandIds],
      );
      await ds.query('ALTER TABLE "refund_payout_corrections" ENABLE TRIGGER USER');
      // The runner payout ledger is append-only too (rows 107).
      await ds.query('ALTER TABLE "runner_payout_lines" DISABLE TRIGGER USER');
      await ds.query('DELETE FROM "runner_payout_lines" WHERE "relatedLineId" IS NOT NULL AND "errandId" = ANY($1)', [errandIds]);
      await ds.query('DELETE FROM "runner_payout_lines" WHERE "errandId" = ANY($1)', [errandIds]);
      await ds.query('ALTER TABLE "runner_payout_lines" ENABLE TRIGGER USER');
      await ds.query('DELETE FROM "refund_reviews" WHERE "errandId" = ANY($1)', [errandIds]);
      const tables: { table_name: string }[] = await ds.query(
        `SELECT table_name FROM information_schema.columns
          WHERE table_schema = 'public' AND column_name = 'errandId'
            AND table_name <> 'errands'`,
      );
      for (const { table_name } of tables) {
        await ds.query(`DELETE FROM "${table_name}" WHERE "errandId" = ANY($1)`, [errandIds]);
      }
      await ds.query('DELETE FROM "errands" WHERE id = ANY($1)', [errandIds]);
    }
    if (userIds.length > 0) {
      await ds.query('DELETE FROM "notifications" WHERE "userId" = ANY($1)', [userIds]);
      await ds.query('DELETE FROM "notification_log" WHERE "userId" = ANY($1)', [userIds]);
      await ds.query(
        `DELETE FROM "payment_methods" WHERE "customerProfileId" IN
           (SELECT id FROM "customer_profiles" WHERE "userId" = ANY($1))`,
        [userIds],
      );
      // ID document access log is append-only (row 154).
      await ds.query('ALTER TABLE "verification_document_access_log" DISABLE TRIGGER USER');
      await ds.query(
        `DELETE FROM "verification_document_access_log" WHERE "runnerProfileId" IN
           (SELECT id FROM "runner_profiles" WHERE "userId" = ANY($1))`,
        [userIds],
      );
      await ds.query('ALTER TABLE "verification_document_access_log" ENABLE TRIGGER USER');
      await ds.query(
        `DELETE FROM "runner_verifications" WHERE "runnerProfileId" IN
           (SELECT id FROM "runner_profiles" WHERE "userId" = ANY($1))`,
        [userIds],
      );
      // Payout requests are append-only (row 153): lift the trigger for the cleanup only.
      await ds.query('ALTER TABLE "runner_payout_requests" DISABLE TRIGGER USER');
      await ds.query(
        `DELETE FROM "runner_payout_requests" WHERE "runnerProfileId" IN
           (SELECT id FROM "runner_profiles" WHERE "userId" = ANY($1))`,
        [userIds],
      );
      await ds.query('ALTER TABLE "runner_payout_requests" ENABLE TRIGGER USER');
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

  /** Paid send_to_runner Buy For Me (fees 500 + item 500 = 1000 to Nitume), assigned. */
  const paidAndAssigned = async () => {
    const customer = await makeUser(UserRole.CUSTOMER);
    const admin = await makeUser(UserRole.ADMIN, 'Finance Ops');
    const runner = await makeUser(UserRole.RUNNER);
    const errand = await createErrand(customer, buyForMe);
    await submitAndQuote(customer, admin, errand.id);
    await setStatus(customer, errand.id, 'ACCEPTED');
    await pay(customer, errand.id, { merchantRoute: 'send_to_runner' });
    await http()
      .post(`/api/v1/errands/${errand.id}/assign`)
      .set(bearer(admin.token))
      .send({ runnerProfileId: runner.profileId })
      .expect(201);
    return { customer, admin, runner, errand };
  };


  const upload = (actor: Actor, errandId: string, type = 'receipt') =>
    http()
      .post(`/api/v1/errands/${errandId}/evidence`)
      .set(bearer(actor.token))
      .send({ type, contentType: 'image/png', data: Buffer.from('receipt-bytes').toString('base64') })
      .expect(201);

  const linesOf = async (errandId: string) =>
    (await db().query(
      `SELECT id, kind, status, amount, "requestedAmount", "reviewReason", "runnerProfileId", "purchaseLimitAtCreation"
         FROM "runner_payout_lines" WHERE "errandId" = $1 ORDER BY kind::text`,
      [errandId],
    )) as { id: string; kind: string; status: string; amount: string | null; requestedAmount: string; reviewReason: string | null }[];

  /** Runs the paid, assigned errand to CONFIRMED with a receipt on file; returns the item line id. */
  const toConfirmed = async (ctx: { customer: Actor; runner: Actor; errand: { id: string } }) => {
    for (const to of ['RUNNER_EN_ROUTE', 'ARRIVED', 'IN_PROGRESS']) {
      await setStatus(ctx.runner, ctx.errand.id, to);
    }
    await upload(ctx.runner, ctx.errand.id);
    await setStatus(ctx.runner, ctx.errand.id, 'AWAITING_CUSTOMER');
    await setStatus(ctx.customer, ctx.errand.id, 'COMPLETED');
    await app
      .get(ErrandsService)
      .transition(ctx.errand.id, ErrandStatus.CONFIRMED, { type: StatusHistoryActor.SYSTEM }, 'Dispute window passed');
    return (await linesOf(ctx.errand.id)).find((l) => l.kind === 'item_reimbursement')!;
  };

  /** A runner with one confirmed task: KES 800 available (300 fee + 500 item). */
  const runnerWithAvailable = async () => {
    const ctx = await paidAndAssigned();
    await toConfirmed(ctx);
    return ctx;
  };

  const requestPayout = (runner: Actor, amount: number, key?: string, expected = 201) => {
    const req = http().post('/api/v1/runners/me/payout-requests').set(bearer(runner.token));
    if (key) {
      req.set('Idempotency-Key', key);
    }
    return req.send({ amount }).expect(expected);
  };

  describe('row 165: createdByUserId and updatedAt on payout requests', () => {
    it('createdByUserId is the authenticated runner, never the body, and immutable; updatedAt moves on the transition', async () => {
      const { runner, admin } = await runnerWithAvailable();
      const forged = await http()
        .post('/api/v1/runners/me/payout-requests')
        .set(bearer(runner.token))
        .send({ amount: 600, createdByUserId: admin.id })
        .expect(400);
      expect(JSON.stringify(forged.body)).toMatch(/createdByUserId/);
      const created = await requestPayout(runner, 600);
      const [row] = (await db().query(
        `SELECT "createdByUserId", "createdAt", "updatedAt" FROM "runner_payout_requests" WHERE id = $1`,
        [created.body.id],
      )) as { createdByUserId: string; createdAt: Date; updatedAt: Date }[];
      expect(row.createdByUserId).toBe(runner.id);
      expect(row.updatedAt.getTime()).toBe(row.createdAt.getTime());
      await expect(
        db().query(`UPDATE "runner_payout_requests" SET "createdByUserId" = $2 WHERE id = $1`, [created.body.id, admin.id]),
      ).rejects.toThrow(/not allowed|immutable/);
      // A request recorded for another user than the runner is refused by the database.
      await expect(
        db().query(
          `INSERT INTO "runner_payout_requests" ("runnerProfileId", "requestedAmount", "destinationPhone", "createdByUserId")
           VALUES ($1, 600, '+254700000000', $2)`,
          [runner.profileId, admin.id],
        ),
      ).rejects.toThrow(/createdByUserId must be the requesting runner/);
      await http()
        .post(`/api/v1/runner-payout-requests/${created.body.id}/reject`)
        .set(bearer(admin.token))
        .send({ note: 'Please confirm your M-Pesa name first' })
        .expect(200);
      const [after] = (await db().query(
        `SELECT "requestedAmount", "createdByUserId", "updatedAt" FROM "runner_payout_requests" WHERE id = $1`,
        [created.body.id],
      )) as { requestedAmount: string; createdByUserId: string; updatedAt: Date }[];
      expect(after).toMatchObject({ requestedAmount: '600.00', createdByUserId: runner.id });
      expect(after.updatedAt.getTime()).toBeGreaterThan(row.updatedAt.getTime());
    });
  });

  describe('row 166: ops-only cancel of an open payout request', () => {
    it('admin cancels with a reason; final; the runner sees cancelled without the reason; available unchanged; runner cannot cancel', async () => {
      const { runner, admin } = await runnerWithAvailable();
      const created = await requestPayout(runner, 700);
      // Runners cannot cancel (admin route), not even their own request.
      await http()
        .post(`/api/v1/runner-payout-requests/${created.body.id}/cancel`)
        .set(bearer(runner.token))
        .send({ reason: 'I changed my mind' })
        .expect(403);
      const missing = await http()
        .post(`/api/v1/runner-payout-requests/${created.body.id}/cancel`)
        .set(bearer(admin.token))
        .send({ reason: 'Too short' })
        .expect(400);
      expect(missing.body).toMatchObject({ code: 'cancellation_reason_required', minLength: 10, maxLength: 500 });
      await http().post(`/api/v1/runner-payout-requests/${created.body.id}/cancel`).set(bearer(admin.token)).send({}).expect(400);
      const cancelled = await http()
        .post(`/api/v1/runner-payout-requests/${created.body.id}/cancel`)
        .set(bearer(admin.token))
        .send({ reason: 'Destination number failed the fraud check' })
        .expect(200);
      expect(cancelled.body).toMatchObject({
        status: 'cancelled',
        requestedAmount: '700.00',
        paidAmount: null,
        decidedAt: null,
        decidedBy: null,
        note: null,
        cancelledBy: { id: admin.id, displayName: 'Finance Ops' },
        cancellationReason: 'Destination number failed the fraud check',
        lineIds: [],
        createdBy: { id: runner.id },
      });
      expect(typeof cancelled.body.cancelledAt).toBe('string');
      expect(new Date(cancelled.body.updatedAt).getTime()).toBeGreaterThan(new Date(cancelled.body.createdAt).getTime());
      // Final: no second decision.
      for (const [path, body] of [
        ['cancel', { reason: 'Second cancel attempt' }],
        ['reject', { note: 'Too late to reject' }],
      ] as const) {
        const again = await http()
          .post(`/api/v1/runner-payout-requests/${created.body.id}/${path}`)
          .set(bearer(admin.token))
          .send(body)
          .expect(409);
        expect(again.body).toMatchObject({ code: 'payout_request_not_open', status: 'cancelled' });
      }
      await expect(
        db().query(`UPDATE "runner_payout_requests" SET status = 'requested' WHERE id = $1`, [created.body.id]),
      ).rejects.toThrow(/final/);
      // Admin filters and count know the status.
      const list = await http()
        .get(`/api/v1/runner-payout-requests?status=cancelled&runnerProfileId=${runner.profileId}`)
        .set(bearer(admin.token))
        .expect(200);
      expect(list.body.items.map((i: { id: string }) => i.id)).toEqual([created.body.id]);
      await http().get('/api/v1/runner-payout-requests/count?status=cancelled').set(bearer(admin.token)).expect(200);
      // The runner sees it cancelled, without the ops reason; the amount stays available.
      const mine = await http().get('/api/v1/runners/me/payout-requests').set(bearer(runner.token)).expect(200);
      expect(mine.body.items[0]).toMatchObject({ id: created.body.id, status: 'cancelled', decisionNote: null, paidAmount: null });
      expect(typeof mine.body.items[0].cancelledAt).toBe('string');
      expect(JSON.stringify(mine.body)).not.toContain('fraud check');
      const summary = await http().get('/api/v1/runners/me/payout-requests/summary').set(bearer(runner.token)).expect(200);
      expect(summary.body).toMatchObject({ availableAmount: '800.00', openRequest: null });
      // A new request can be made at once.
      await requestPayout(runner, 800);
    });

    it('a paid or rejected request cannot be cancelled', async () => {
      const { runner, admin } = await runnerWithAvailable();
      const created = await requestPayout(runner, 600);
      await http()
        .post(`/api/v1/runner-payout-requests/${created.body.id}/reject`)
        .set(bearer(admin.token))
        .send({ note: 'Please confirm your M-Pesa name first' })
        .expect(200);
      const res = await http()
        .post(`/api/v1/runner-payout-requests/${created.body.id}/cancel`)
        .set(bearer(admin.token))
        .send({ reason: 'Cancel after the reject' })
        .expect(409);
      expect(res.body).toMatchObject({ code: 'payout_request_not_open', status: 'rejected' });
    });
  });
});
