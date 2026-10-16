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
 * Contract checks for the owner answers 8 (BOARD rows 151-154 and the OTP
 * copy): purchase limit stored at line creation, the purchase-limit
 * exception, runner payout requests, restricted ID storage. Every row created
 * here is removed in afterAll.
 */
describe('Owner answers 8 (e2e)', () => {
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

  const setLimit = (runner: Actor, amount: number) =>
    db().query('UPDATE "runner_profiles" SET "maxPurchaseAdvance" = $2 WHERE id = $1', [runner.profileId, amount]);

  describe('row 152: purchase limit stored when the obligation is created', () => {
    it('created at KES 400, limit later 1,000: the review ceiling stays 400', async () => {
      const ctx = await paidAndAssigned();
      await setLimit(ctx.runner, 400);
      const item = await toConfirmed(ctx);
      expect(item).toMatchObject({ status: 'on_hold', reviewReason: 'over_purchase_limit', purchaseLimitAtCreation: '400.00' });
      await setLimit(ctx.runner, 1000);
      const detail = await http().get(`/api/v1/runner-payouts/${item.id}`).set(bearer(ctx.admin.token)).expect(200);
      expect(detail.body).toMatchObject({
        approvalCeiling: '400.00',
        purchaseLimit: '400.00',
        purchaseLimitAtCreation: '400.00',
        runner: { maxPurchaseAdvance: '1000.00' },
      });
      const over = await http()
        .post(`/api/v1/runner-payouts/${item.id}/review`)
        .set(bearer(ctx.admin.token))
        .send({ decision: 'approve', amount: 401 })
        .expect(400);
      expect(over.body).toMatchObject({ code: 'reimbursement_exceeds_cap', approvalCeiling: '400.00', purchaseLimit: '400.00' });
      await http()
        .post(`/api/v1/runner-payouts/${item.id}/review`)
        .set(bearer(ctx.admin.token))
        .send({ decision: 'approve', amount: 400 })
        .expect(200);
    });

    it('the stored limit is part of the line identity (ledger guard)', async () => {
      const ctx = await paidAndAssigned();
      const item = await toConfirmed(ctx);
      expect(item).toMatchObject({ status: 'payable', purchaseLimitAtCreation: '3000.00' });
      await expect(
        db().query('UPDATE "runner_payout_lines" SET "purchaseLimitAtCreation" = 9000 WHERE id = $1', [item.id]),
      ).rejects.toThrow(/immutable/);
    });
  });

  describe('rows 142, 151 (N-21): purchase-limit exception', () => {
    it('approves above the limit only with a reason, recorded append-only with the approval', async () => {
      const ctx = await paidAndAssigned();
      await setLimit(ctx.runner, 400);
      const item = await toConfirmed(ctx);
      const review = (body: Record<string, unknown>, status: number) =>
        http()
          .post(`/api/v1/runner-payouts/${item.id}/review`)
          .set(bearer(ctx.admin.token))
          .send({ decision: 'approve', ...body })
          .expect(status);
      const before = await http().get(`/api/v1/runner-payouts/${item.id}`).set(bearer(ctx.admin.token)).expect(200);
      expect(before.body).toMatchObject({ approvalCeiling: '400.00', overLimitCeiling: '500.00', purchaseLimitOverride: null });
      const plain = await review({ amount: 450 }, 400);
      expect(plain.body).toMatchObject({ code: 'reimbursement_exceeds_cap', approvalCeiling: '400.00', overLimitCeiling: '500.00' });
      const short = await review({ amount: 450, purchaseLimitOverrideNote: 'short' }, 400);
      expect(short.body).toMatchObject({ code: 'purchase_limit_override_note_invalid' });
      const above = await review({ amount: 500.01, purchaseLimitOverrideNote: 'Approved by ops lead on the phone' }, 400);
      expect(above.body).toMatchObject({ code: 'reimbursement_exceeds_cap', cap: '500.00' });
      const ok = await review({ amount: 450, purchaseLimitOverrideNote: 'Approved by ops lead on the phone' }, 200);
      expect(ok.body).toMatchObject({
        status: 'payable',
        amount: '450.00',
        purchaseLimitOverride: {
          errandId: ctx.errand.id,
          runnerProfileId: ctx.runner.profileId,
          lineId: item.id,
          limitAtTime: '400.00',
          requestedAmount: '500.00',
          approvedAmount: '450.00',
          amountAbove: '50.00',
          note: 'Approved by ops lead on the phone',
          createdBy: { id: ctx.admin.id, displayName: 'Finance Ops' },
        },
        exposureOverrides: [],
      });
      expect(ok.body.purchaseLimitOverride.assignmentId).toEqual(expect.any(String));
      const [row] = await db().query(
        `SELECT id, source::text AS source FROM "task_exposure_overrides" WHERE "runnerPayoutLineId" = $1`,
        [item.id],
      );
      expect(row.source).toBe('purchase_limit');
      await expect(
        db().query(`UPDATE "task_exposure_overrides" SET note = 'changed later' WHERE id = $1`, [row.id]),
      ).rejects.toThrow(/append-only/);
    });
  });

  describe('rows 117, 146, 153 (RA-15, N-17): runner payout requests', () => {
    it('runner requests, ops pay whole lines below the request: PAID with both amounts; the rest stays available', async () => {
      const first = await paidAndAssigned();
      await toConfirmed(first);
      // A second confirmed task for the same runner.
      const customer2 = await makeUser(UserRole.CUSTOMER);
      const errand2 = await createErrand(customer2, buyForMe);
      await submitAndQuote(customer2, first.admin, errand2.id);
      await setStatus(customer2, errand2.id, 'ACCEPTED');
      await pay(customer2, errand2.id, { merchantRoute: 'send_to_runner' });
      await http()
        .post(`/api/v1/errands/${errand2.id}/assign`)
        .set(bearer(first.admin.token))
        .send({ runnerProfileId: first.runner.profileId })
        .expect(201);
      await toConfirmed({ customer: customer2, runner: first.runner, errand: errand2 });
      const { runner, admin } = first;

      const summary = await http().get('/api/v1/runners/me/payout-requests/summary').set(bearer(runner.token)).expect(200);
      expect(summary.body).toMatchObject({ availableAmount: '1600.00', openRequest: null });
      expect(summary.body.minimumAmount).toEqual(expect.any(String));
      const over = await http()
        .post('/api/v1/runners/me/payout-requests')
        .set(bearer(runner.token))
        .send({ amount: 1600.01 })
        .expect(400);
      expect(over.body).toMatchObject({ code: 'payout_exceeds_available', availableAmount: '1600.00' });
      const key = `e2e-${Date.now()}`;
      const created = await http()
        .post('/api/v1/runners/me/payout-requests')
        .set(bearer(runner.token))
        .set('Idempotency-Key', key)
        .send({ amount: 1500 })
        .expect(201);
      expect(created.body).toMatchObject({ requestedAmount: '1500.00', paidAmount: null, status: 'requested' });
      const replay = await http()
        .post('/api/v1/runners/me/payout-requests')
        .set(bearer(runner.token))
        .set('Idempotency-Key', key)
        .send({ amount: 1500 })
        .expect(201);
      expect(replay.body.id).toBe(created.body.id);
      const second = await http()
        .post('/api/v1/runners/me/payout-requests')
        .set(bearer(runner.token))
        .send({ amount: 100 })
        .expect(409);
      expect(second.body).toMatchObject({ code: 'payout_request_open', requestId: created.body.id });
      // Admin only.
      await http().get('/api/v1/runner-payout-requests').set(bearer(runner.token)).expect(403);

      const list = await http()
        .get(`/api/v1/runner-payout-requests?status=requested&runnerProfileId=${runner.profileId}`)
        .set(bearer(admin.token))
        .expect(200);
      expect(list.body.items).toEqual([
        expect.objectContaining({ id: created.body.id, availableAmount: '1600.00', runner: expect.objectContaining({ id: runner.profileId }) }),
      ]);
      const lines = await linesOf(first.errand.id);
      const all = [...lines, ...(await linesOf(errand2.id))];
      const tooMuch = await http()
        .post(`/api/v1/runner-payout-requests/${created.body.id}/pay`)
        .set(bearer(admin.token))
        .send({ lineIds: all.map((l) => l.id), payoutReference: 'SGH81PRQ01' })
        .expect(400);
      expect(tooMuch.body).toMatchObject({ code: 'payout_exceeds_request', requestedAmount: '1500.00', selectedAmount: '1600.00' });
      // Whole lines: 800 (task 1) + 300 (task 2 fee) = 1100, below the 1500 asked.
      const payIds = [...lines.map((l) => l.id), (await linesOf(errand2.id)).find((l) => l.kind === 'runner_fee')!.id];
      const paid = await http()
        .post(`/api/v1/runner-payout-requests/${created.body.id}/pay`)
        .set(bearer(admin.token))
        .send({ lineIds: payIds, payoutReference: 'sgh81prq01' })
        .expect(200);
      expect(paid.body).toMatchObject({
        status: 'paid',
        requestedAmount: '1500.00',
        paidAmount: '1100.00',
        payoutReference: 'SGH81PRQ01',
        lineIds: [...payIds].sort(),
        decidedBy: { id: admin.id },
      });
      await http()
        .post(`/api/v1/runner-payout-requests/${created.body.id}/reject`)
        .set(bearer(admin.token))
        .send({ note: 'Too late to reject' })
        .expect(409);
      const feed = await http().get('/api/v1/runners/me/payout-lines?kind=payout').set(bearer(runner.token)).expect(200);
      expect(feed.body.items[0]).toMatchObject({
        kind: 'payout',
        amount: '-1100.00',
        payoutRequestId: created.body.id,
        requestedAmount: '1500.00',
      });
      // The remaining 500 is available for a new request.
      const after = await http().get('/api/v1/runners/me/payout-requests/summary').set(bearer(runner.token)).expect(200);
      expect(after.body).toMatchObject({ availableAmount: '500.00', openRequest: null });
      const mine = await http().get('/api/v1/runners/me/payout-requests').set(bearer(runner.token)).expect(200);
      expect(mine.body.items[0]).toMatchObject({ id: created.body.id, status: 'paid', paidAmount: '1100.00', reference: 'SGH81PRQ01' });
      const next = await http()
        .post('/api/v1/runners/me/payout-requests')
        .set(bearer(runner.token))
        .send({ amount: 500 })
        .expect(201);
      const rejected = await http()
        .post(`/api/v1/runner-payout-requests/${next.body.id}/reject`)
        .set(bearer(admin.token))
        .send({ note: 'Please confirm your M-Pesa name first' })
        .expect(200);
      expect(rejected.body).toMatchObject({ status: 'rejected', note: 'Please confirm your M-Pesa name first', paidAmount: null });
      await expect(
        db().query('UPDATE "runner_payout_requests" SET "requestedAmount" = 1 WHERE id = $1', [next.body.id]),
      ).rejects.toThrow(/final/);
    });
  });
});
