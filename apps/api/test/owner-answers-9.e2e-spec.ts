import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { ErrandStatus, StatusHistoryActor, UserRole } from '../src/common/enums';
import { ErrandsService } from '../src/errands/errands.service';
import { CustomersService } from '../src/customers/customers.service';
import { RunnersService } from '../src/runners/runners.service';
import { UsersService } from '../src/users/users.service';
import { RedisService } from '../src/infra/redis/redis.service';
import { IdDocumentRetentionService } from '../src/scheduler/id-document-retention.service';
import { RunnersService as Runners } from '../src/runners/runners.service';
import {
  VERIFICATION_DOCUMENT_STORAGE,
  VerificationDocumentStorage,
} from '../src/runners/verification-storage/verification-document-storage';
import { NOTIFICATIONS_QUEUE } from '../src/infra/queue/queues';
import { FEED_JOB, FeedJob, NotificationsService } from '../src/notifications/notifications.service';

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
  /** Redis keys this file creates (idempotency), removed in afterAll. */
  const redisKeys: string[] = [];

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
    await app.get(RedisService).del(...redisKeys);
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

  describe('row 157: a lapsed admin offer (admin feed, assignment history)', () => {
    it('the sweep tells the admins (Offer ended), not the customer; the admin detail lists the offers', async () => {
      const { customer, admin, runner, errand } = await paidAndAssigned();
      await db().query(
        `UPDATE "errand_assignments" SET "offerExpiresAt" = now() - interval '1 second' WHERE "errandId" = $1`,
        [errand.id],
      );
      // The notifications queue is in the shared Redis: capture this errand's jobs here.
      const queue = app.get<Queue>(getQueueToken(NOTIFICATIONS_QUEUE));
      const original = queue.add.bind(queue);
      const captured: FeedJob[] = [];
      const spy = vi.spyOn(queue, 'add').mockImplementation(((name: string, data: FeedJob, opts?: unknown) => {
        if (name === FEED_JOB && data.errandId === errand.id) {
          captured.push(data);
          return Promise.resolve({ id: 'captured' } as never);
        }
        return original(name, data, opts as never);
      }) as never);
      try {
        expect(await app.get(ErrandsService).expireLapsedOffers()).toContain(errand.id);
        for (let i = 0; i < 30 && captured.length === 0; i += 1) {
          await new Promise((r) => setTimeout(r, 100));
        }
        await new Promise((r) => setTimeout(r, 200));
      } finally {
        spy.mockRestore();
      }
      // Only the admin item: no customer notification for a lapse.
      expect(captured).toEqual([{ kind: 'assignment_expired', errandId: errand.id, reference: expect.any(String) }]);
      await app.get(NotificationsService).deliverFeed(captured[0]);
      const [item] = (await db().query(
        `SELECT title, body, "eventType" FROM "notifications" WHERE "userId" = $1 AND "errandId" = $2 AND "eventType" = 'assignment.expired'`,
        [admin.id, errand.id],
      )) as { title: string; body: string; eventType: string }[];
      expect(item).toMatchObject({ title: 'Offer ended', body: expect.stringContaining('in time. Offer it to another runner.') });
      expect(
        await db().query(`SELECT id FROM "notifications" WHERE "userId" = $1 AND "eventType" = 'assignment.expired'`, [customer.id]),
      ).toEqual([]);

      // Before the reassign: no current holder, but ops see the lapsed offer.
      const lapsed = await http().get(`/api/v1/errands/${errand.id}`).set(bearer(admin.token)).expect(200);
      expect(lapsed.body.assignment).toBeNull();
      expect(lapsed.body.lastAssignment).toMatchObject({
        status: 'expired',
        decidedAt: expect.any(String),
        offerExpiresAt: expect.any(String),
        declineReason: null,
        runner: expect.objectContaining({ id: runner.profileId }),
      });
      const listed = await http().get('/api/v1/errands?status=RUNNER_ASSIGNED&limit=100').set(bearer(admin.token)).expect(200);
      const row = (listed.body.items as { id: string; lastAssignment: { status: string } | null }[]).find((e) => e.id === errand.id);
      expect(row?.lastAssignment).toMatchObject({ status: 'expired' });
      const customerView = await http().get(`/api/v1/errands/${errand.id}`).set(bearer(customer.token)).expect(200);
      expect(customerView.body).not.toHaveProperty('lastAssignment');

      const other = await makeUser(UserRole.RUNNER);
      await http()
        .post(`/api/v1/errands/${errand.id}/assign`)
        .set(bearer(admin.token))
        .send({ runnerProfileId: other.profileId })
        .expect(201);
      const detail = await http().get(`/api/v1/errands/${errand.id}`).set(bearer(admin.token)).expect(200);
      expect(detail.body.offerWindowSeconds).toBe(600);
      expect(detail.body.assignment).toMatchObject({ status: 'assigned', decidedAt: null, declineReason: null });
      expect(detail.body.assignments).toEqual([
        expect.objectContaining({ status: 'assigned', runner: expect.objectContaining({ id: other.profileId }) }),
        expect.objectContaining({
          status: 'expired',
          decidedAt: expect.any(String),
          declineReason: null,
          offeredAt: expect.any(String),
          runner: expect.objectContaining({ id: runner.profileId }),
        }),
      ]);
      // Customers and runners get no history.
      const mine = await http().get(`/api/v1/errands/${errand.id}`).set(bearer(customer.token)).expect(200);
      expect(mine.body).not.toHaveProperty('assignments');
      expect(mine.body).not.toHaveProperty('offerWindowSeconds');
    });
  });

  /** A minimal JPEG-signed buffer of `size` bytes. */
  const jpeg = (size = 64): Buffer => {
    const buf = Buffer.alloc(size, 0);
    buf.set([0xff, 0xd8, 0xff, 0xe0]);
    return buf;
  };

  const uploadDoc = (runner: Actor, file: Buffer, contentType = 'image/jpeg', verificationType = 'government_id') =>
    http()
      .post('/api/v1/runners/me/verifications/documents')
      .set(bearer(runner.token))
      .field('verificationType', verificationType)
      .attach('file', file, { filename: 'front.jpg', contentType });

  describe('row 163: 10 MB per ID/selfie image, refused before storage', () => {
    it('answers 413 verification_document_too_large with maxBytes and stores nothing', async () => {
      const runner = await makeUser(UserRole.RUNNER);
      const storage = app.get<VerificationDocumentStorage>(VERIFICATION_DOCUMENT_STORAGE);
      const upload = vi.spyOn(storage, 'upload');
      try {
        const big = await uploadDoc(runner, jpeg(10 * 1024 * 1024 + 1)).expect(413);
        expect(big.body).toMatchObject({ statusCode: 413, code: 'verification_document_too_large', maxBytes: 10 * 1024 * 1024 });
        expect(upload).not.toHaveBeenCalled();
        expect(
          await db().query('SELECT id FROM "runner_verifications" WHERE "runnerProfileId" = $1', [runner.profileId]),
        ).toEqual([]);
        // Exactly at the limit is accepted.
        await uploadDoc(runner, jpeg(10 * 1024 * 1024)).expect(201);
        expect(upload).toHaveBeenCalledTimes(1);
      } finally {
        upload.mockRestore();
      }
    });
  });

  it('a file whose bytes are not the declared image type is refused before storage (review minor 4)', async () => {
    const runner = await makeUser(UserRole.RUNNER);
    const res = await uploadDoc(runner, Buffer.from('%PDF-1.7 not an image'), 'image/jpeg', 'selfie').expect(400);
    expect(res.body).toMatchObject({ code: 'verification_document_type_invalid' });
    expect(await db().query('SELECT id FROM "runner_verifications" WHERE "runnerProfileId" = $1', [runner.profileId])).toEqual([]);
  });

  describe('rows 161, 170, 171, 175: retention clock, minimum metadata, re-review, holds', () => {
    const approve = (admin: Actor, runner: Actor, id: string, reviewerNote?: string) =>
      http()
        .patch(`/api/v1/runners/${runner.profileId}/verifications/${id}`)
        .set(bearer(admin.token))
        .send({ decision: 'approved', ...(reviewerNote ? { reviewerNote } : {}) })
        .expect(200);
    const backdate = (runner: Actor) =>
      db().query(
        `UPDATE "runner_verifications" SET "createdAt" = now() - interval '730 days',
                "reviewedAt" = CASE WHEN "reviewedAt" IS NULL THEN NULL ELSE now() - interval '730 days' END
          WHERE "runnerProfileId" = $1`,
        [runner.profileId],
      );
    const dueIds = async (runner: Actor) =>
      (await app.get(Runners).documentsDueForPurge(new Date(), 200, [runner.profileId!])).map((d) => d.id);
    const purge = (runner: Actor) => app.get(IdDocumentRetentionService).purgeExpired(new Date(), 200, [runner.profileId!]);

    it('a view never restarts the clock; an audited re-review does; pending is never purged or re-reviewed', async () => {
      const runner = await makeUser(UserRole.RUNNER);
      const admin = await makeUser(UserRole.ADMIN, 'Verifier');
      const id = (await uploadDoc(runner, jpeg()).expect(201)).body.id as string;
      await approve(admin, runner, id);
      await backdate(runner);
      expect(await dueIds(runner)).toEqual([id]);
      await http().get(`/api/v1/runners/verifications/${id}/document`).set(bearer(admin.token)).expect(200);
      expect(await dueIds(runner)).toEqual([id]);

      await http().post(`/api/v1/runners/verifications/${id}/re-review`).set(bearer(runner.token)).expect(403);
      const rr = await http().post(`/api/v1/runners/verifications/${id}/re-review`).set(bearer(admin.token)).expect(200);
      expect(rr.body).toMatchObject({ verificationId: id, eventId: expect.any(String), reReviewedAt: expect.any(String) });
      const [event] = await db().query(
        `SELECT action::text AS action, "actorUserId", ip FROM "verification_document_access_log" WHERE id = $1`,
        [rr.body.eventId],
      );
      expect(event).toMatchObject({ action: 're_review', actorUserId: admin.id, ip: expect.any(String) });
      expect(await dueIds(runner)).toEqual([]);
      expect(await purge(runner)).toEqual([]);

      const pending = (await uploadDoc(runner, jpeg(), 'image/jpeg', 'selfie').expect(201)).body.id as string;
      const notDecided = await http().post(`/api/v1/runners/verifications/${pending}/re-review`).set(bearer(admin.token)).expect(409);
      expect(notDecided.body).toMatchObject({ code: 'verification_not_decided' });
      await backdate(runner);
      // The re-review (logged today) still holds the clock, and pending is never due.
      expect(await dueIds(runner)).toEqual([]);
    });

    it('an open dispute holds the purge; once resolved the image goes and only minimum metadata stays (note cleared)', async () => {
      const ctx = await paidAndAssigned();
      const { runner, admin, customer, errand } = ctx;
      const id = (await uploadDoc(runner, jpeg()).expect(201)).body.id as string;
      await approve(admin, runner, id, 'Name matches the M-Pesa record');
      for (const to of ['RUNNER_EN_ROUTE', 'ARRIVED', 'IN_PROGRESS']) {
        await setStatus(runner, errand.id, to);
      }
      await upload(runner, errand.id);
      await setStatus(runner, errand.id, 'AWAITING_CUSTOMER');
      await http()
        .post('/api/v1/disputes')
        .set(bearer(customer.token))
        .send({ errandId: errand.id, reason: 'Wrong item delivered' })
        .expect(201);
      await backdate(runner);
      expect(await dueIds(runner)).toEqual([id]);
      expect(await purge(runner)).toEqual([]);

      await http()
        .patch(`/api/v1/errands/${errand.id}/resolve-dispute`)
        .set(bearer(admin.token))
        .send({ verdict: 'runner', rationale: 'Receipt and photos show the runner bought the right item.' })
        .expect(200);
      expect(await purge(runner)).toEqual([id]);
      const [row] = await db().query(
        `SELECT "documentS3Key", "reviewerNote", "purgedAt", status::text AS status, "verificationType"::text AS type,
                "reviewedBy", "reviewedAt", "createdAt"
           FROM "runner_verifications" WHERE id = $1`,
        [id],
      );
      expect(row).toMatchObject({
        documentS3Key: null,
        reviewerNote: null,
        purgedAt: expect.any(Date),
        status: 'approved',
        type: 'government_id',
        reviewedBy: admin.id,
        reviewedAt: expect.any(Date),
        createdAt: expect.any(Date),
      });
      const rr = await http().post(`/api/v1/runners/verifications/${id}/re-review`).set(bearer(admin.token)).expect(410);
      expect(rr.body).toMatchObject({ code: 'verification_document_purged' });
    });
  });

  describe('review minor 1: payout request Idempotency-Key', () => {
    it('concurrent calls with one key create one request; another amount is refused', async () => {
      const { runner } = await runnerWithAvailable();
      const key = `e2e9-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      redisKeys.push(`idem:runner-payout-request:${runner.profileId}:${key}`);
      const send = (amount: number) =>
        http()
          .post('/api/v1/runners/me/payout-requests')
          .set(bearer(runner.token))
          .set('Idempotency-Key', key)
          .send({ amount })
          .then((r) => r);
      const results = await Promise.all([send(600), send(600), send(600)]);
      const created = results.filter((r) => r.status === 201);
      expect(created.length).toBeGreaterThanOrEqual(1);
      expect(new Set(created.map((r) => r.body.id)).size).toBe(1);
      for (const r of results.filter((x) => x.status !== 201)) {
        expect([r.status, r.body.code]).toEqual([409, 'idempotency_in_progress']);
      }
      const replay = await send(600);
      expect([replay.status, replay.body.id]).toEqual([201, created[0].body.id]);
      const other = await send(700);
      expect([other.status, other.body.code, other.body.requestId]).toEqual([409, 'idempotency_key_reused', created[0].body.id]);
      const rows = await db().query('SELECT id FROM "runner_payout_requests" WHERE "runnerProfileId" = $1', [runner.profileId]);
      expect(rows).toHaveLength(1);
    });
  });
});
