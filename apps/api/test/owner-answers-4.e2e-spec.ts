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
import { deleteRunnerVerifications, readyRunner, runnerPhoto } from './support/runner-fixtures';

/**
 * Contract checks for the owner answers 4 (BOARD rows 68, 79, 80, 82, 83,
 * 86, 87) and spec gaps N-9..N-14. Every row created here is removed in
 * afterAll.
 */
describe('Owner answers 4 (e2e)', () => {
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
      // RA-8: verified and online, so assign and accept work.
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

  const toInProgress = async (parties: { customer: Actor; admin: Actor; runner: Actor }, errandId: string) => {
    const { customer, admin, runner } = parties;
    await submitAndQuote(customer, admin, errandId);
    await setStatus(customer, errandId, 'ACCEPTED');
    await pay(customer, errandId, { merchantRoute: 'send_to_runner' });
    await http()
      .post(`/api/v1/errands/${errandId}/assign`)
      .set(bearer(admin.token))
      .send({ runnerProfileId: runner.profileId })
      .expect(201);
    for (const to of ['RUNNER_EN_ROUTE', 'ARRIVED', 'IN_PROGRESS']) {
      await setStatus(runner, errandId, to);
    }
  };

  const expireQuote = (errandId: string) =>
    db().query(`UPDATE "quotes" SET "expiresAt" = now() - interval '1 minute' WHERE "errandId" = $1`, [errandId]);

  /** Waits for the notifications worker to write a feed row. */
  const feedRow = async (userId: string, eventType: string): Promise<Record<string, unknown> | null> => {
    for (let i = 0; i < 40; i += 1) {
      const rows: Record<string, unknown>[] = await db().query(
        'SELECT * FROM "notifications" WHERE "userId" = $1 AND "eventType" = $2',
        [userId, eventType],
      );
      if (rows.length > 0) {
        return rows[0];
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    return null;
  };

  const setMerchant = (admin: Actor, errandId: string, tillNumber: string, expected = 200) =>
    http()
      .put(`/api/v1/errands/${errandId}/merchant-details`)
      .set(bearer(admin.token))
      .send({ merchantName: 'Naivas Nyali', tillNumber })
      .expect(expected);

  it('every quote expires: 24h default, null and past refused (row 83)', async () => {
    const customer = await makeUser(UserRole.CUSTOMER);
    const admin = await makeUser(UserRole.ADMIN);
    const errand = await createErrand(customer);
    await http().post(`/api/v1/errands/${errand.id}/submit`).set(bearer(customer.token)).expect(201);
    const nul = await http()
      .post(`/api/v1/errands/${errand.id}/quote`)
      .set(bearer(admin.token))
      .send({ total: 1000, expiresAt: null })
      .expect(400);
    expect(JSON.stringify(nul.body.message)).toContain('expiresAt');
    const past = await http()
      .post(`/api/v1/errands/${errand.id}/quote`)
      .set(bearer(admin.token))
      .send({ total: 1000, expiresAt: new Date(Date.now() - 60_000).toISOString() })
      .expect(400);
    expect(past.body.code).toBe('quote_expiry_in_past');
    const before = Date.now();
    const ok = await http()
      .post(`/api/v1/errands/${errand.id}/quote`)
      .set(bearer(admin.token))
      .send({ total: 1000 })
      .expect(201);
    const ttl = new Date(ok.body.quote.expiresAt as string).getTime() - before;
    expect(Math.abs(ttl - 24 * 3_600_000)).toBeLessThan(60_000);
  });

  it('customer requests a new quote after expiry; admins are told; re-quote clears it (row 68)', async () => {
    const customer = await makeUser(UserRole.CUSTOMER);
    const admin = await makeUser(UserRole.ADMIN);
    const errand = await createErrand(customer);
    await submitAndQuote(customer, admin, errand.id);

    const valid = await http()
      .post(`/api/v1/errands/${errand.id}/quote-request`)
      .set(bearer(customer.token))
      .expect(409);
    expect(valid.body.code).toBe('quote_still_valid');

    await expireQuote(errand.id);
    await http().post(`/api/v1/errands/${errand.id}/quote/request`).set(bearer(admin.token)).expect(403);
    const res = await http()
      .post(`/api/v1/errands/${errand.id}/quote/request`)
      .set(bearer(customer.token))
      .expect(200);
    expect(res.body.status).toBe('QUOTED');
    expect(res.body.quoteRequestedAt).toBeTruthy();

    const again = await http()
      .post(`/api/v1/errands/${errand.id}/quote-request`)
      .set(bearer(customer.token))
      .expect(409);
    expect(again.body).toMatchObject({ code: 'quote_request_pending', quoteRequestedAt: res.body.quoteRequestedAt });

    const queue = await http()
      .get('/api/v1/errands?quoteRequested=true&limit=100')
      .set(bearer(admin.token))
      .expect(200);
    expect(queue.body.items.map((e: { id: string }) => e.id)).toContain(errand.id);
    const count = await http()
      .get('/api/v1/errands/count?quoteRequested=true')
      .set(bearer(admin.token))
      .expect(200);
    expect(count.body.count).toBeGreaterThanOrEqual(1);
    expect(await feedRow(admin.id, 'quote.requested')).toMatchObject({
      errandId: errand.id,
      title: 'New quote requested',
    });

    await http()
      .post(`/api/v1/errands/${errand.id}/quote`)
      .set(bearer(admin.token))
      .send({ total: 1200 })
      .expect(201);
    const detail = await http().get(`/api/v1/errands/${errand.id}`).set(bearer(customer.token)).expect(200);
    expect(detail.body.quoteRequestedAt).toBeNull();
    const after = await http()
      .get('/api/v1/errands?quoteRequested=true&limit=100')
      .set(bearer(admin.token))
      .expect(200);
    expect(after.body.items.map((e: { id: string }) => e.id)).not.toContain(errand.id);
  });

  it('merchant details only for buy_for_me / pickup_delivery; changes after a merchant-direct payment warn (row 80)', async () => {
    const customer = await makeUser(UserRole.CUSTOMER);
    const admin = await makeUser(UserRole.ADMIN);
    const inspection = await createErrand(customer);
    const na = await setMerchant(admin, inspection.id, '123456', 400);
    expect(na.body.code).toBe('merchant_details_not_applicable');

    const errand = await createErrand(customer, buyForMe);
    await submitAndQuote(customer, admin, errand.id);
    await setMerchant(admin, errand.id, '123456');
    await setStatus(customer, errand.id, 'ACCEPTED');
    await pay(customer, errand.id, { merchantRoute: 'merchant_direct' });

    const changed = await setMerchant(admin, errand.id, '654321');
    expect(changed.body.merchantDetailsUpdatedAt).toBeTruthy();
    const detail = await http().get(`/api/v1/errands/${errand.id}`).set(bearer(customer.token)).expect(200);
    expect(detail.body.merchantDetailsUpdatedAt).toBeTruthy();
    expect(await feedRow(customer.id, 'merchant_details.changed')).toMatchObject({
      errandId: errand.id,
      title: 'Merchant payment details changed',
    });
  });

  it('merchant_direct decreases open no refund review (row 86)', async () => {
    const customer = await makeUser(UserRole.CUSTOMER);
    const admin = await makeUser(UserRole.ADMIN);
    const runner = await makeUser(UserRole.RUNNER);
    const errand = await createErrand(customer, buyForMe);
    await submitAndQuote(customer, admin, errand.id);
    await setMerchant(admin, errand.id, '123456');
    await setStatus(customer, errand.id, 'ACCEPTED');
    await pay(customer, errand.id, { merchantRoute: 'merchant_direct' });
    await http()
      .post(`/api/v1/errands/${errand.id}/assign`)
      .set(bearer(admin.token))
      .send({ runnerProfileId: runner.profileId })
      .expect(201);
    for (const to of ['RUNNER_EN_ROUTE', 'ARRIVED', 'IN_PROGRESS']) {
      await setStatus(runner, errand.id, to);
    }
    const req = await http()
      .post(`/api/v1/errands/${errand.id}/price-change`)
      .set(bearer(runner.token))
      .send({ toPrice: 420 })
      .expect(201);
    const res = await http()
      .post(`/api/v1/errands/${errand.id}/price-change/${req.body.id}/approve`)
      .set(bearer(customer.token))
      .send({})
      .expect(201);
    expect(res.body.refundReview).toBeNull();
    const all = await http().get(`/api/v1/errands/${errand.id}/refunds`).set(bearer(customer.token)).expect(200);
    expect(all.body.items).toHaveLength(0);
  });

  it('caps cumulative refunds at what was paid to Nitume (rows 81, 87, N-9)', async () => {
    const customer = await makeUser(UserRole.CUSTOMER);
    const admin = await makeUser(UserRole.ADMIN);
    const runner = await makeUser(UserRole.RUNNER);
    const errand = await createErrand(customer, buyForMe);
    // Fees 500 + item 500 = 1000 paid to Nitume in one STK (send_to_runner).
    await toInProgress({ customer, admin, runner }, errand.id);

    const dec = await http()
      .post(`/api/v1/errands/${errand.id}/price-change`)
      .set(bearer(runner.token))
      .send({ toPrice: 420 })
      .expect(201);
    const approved = await http()
      .post(`/api/v1/errands/${errand.id}/price-change/${dec.body.id}/approve`)
      .set(bearer(customer.token))
      .send({})
      .expect(201);
    expect(approved.body.refundReview).toMatchObject({ amountPaid: '80.00', remainingRefundable: '1000.00' });
    await http()
      .patch(`/api/v1/refunds/${approved.body.refundReview.id}/decision`)
      .set(bearer(admin.token))
      .send({ refundAmount: 80, note: 'internal: decrease confirmed with receipt' })
      .expect(200);

    const pc = await http()
      .post(`/api/v1/errands/${errand.id}/price-change`)
      .set(bearer(runner.token))
      .send({ toPrice: 900 })
      .expect(201);
    const reject = await http()
      .post(`/api/v1/errands/${errand.id}/price-change/${pc.body.id}/reject`)
      .set(bearer(customer.token))
      .expect(201);
    const cancellationId = reject.body.refundReview.id as string;

    const detail = await http().get(`/api/v1/refunds/${cancellationId}`).set(bearer(admin.token)).expect(200);
    expect(detail.body).toMatchObject({
      amountPaid: '1000.00',
      totalPaidToNitume: '1000.00',
      alreadyRefunded: '80.00',
      refundCeiling: '920.00',
      remainingRefundable: '920.00',
    });

    const over = await http()
      .patch(`/api/v1/refunds/${cancellationId}/decision`)
      .set(bearer(admin.token))
      .send({ refundAmount: 1000 })
      .expect(400);
    expect(over.body).toMatchObject({ code: 'refund_exceeds_amount_paid', amountPaid: '920.00' });
    const ok = await http()
      .patch(`/api/v1/refunds/${cancellationId}/decision`)
      .set(bearer(admin.token))
      .send({ refundAmount: 920 })
      .expect(200);
    expect(ok.body).toMatchObject({ status: 'approved', remainingRefundable: '0.00' });

    await http()
      .post(`/api/v1/refunds/${cancellationId}/mark-paid`)
      .set(bearer(admin.token))
      .send({ payoutReference: 'QJK12AB34C' })
      .expect(200);
    const locked = await http()
      .post(`/api/v1/refunds/${cancellationId}/mark-paid`)
      .set(bearer(admin.token))
      .send({ payoutReference: 'QZZ99XY88W' })
      .expect(409);
    expect(locked.body.code).toBe('refund_payout_locked');

    const views = await http().get(`/api/v1/errands/${errand.id}/refunds`).set(bearer(customer.token)).expect(200);
    for (const view of views.body.items) {
      expect(view.remainingRefundable).toBe('0.00');
      expect(view).not.toHaveProperty('decisionNote');
      expect(view).not.toHaveProperty('payoutReference');
    }
    expect(JSON.stringify(views.body)).not.toContain('internal:');
    const refunded = await feedRow(customer.id, 'refund.refunded');
    expect(refunded?.body).toBe('Your refund of KSh 920 has been sent to M-Pesa.');
  });

  it('shows the dispute resolution to customer and runner, not admin internals (row 79)', async () => {
    const customer = await makeUser(UserRole.CUSTOMER);
    const admin = await makeUser(UserRole.ADMIN);
    const runner = await makeUser(UserRole.RUNNER);
    const errand = await createErrand(customer);
    await toInProgress({ customer, admin, runner }, errand.id);
    await runnerPhoto(baseUrl, runner.token, errand.id);
    await setStatus(runner, errand.id, 'AWAITING_CUSTOMER');
    await http()
      .post('/api/v1/disputes')
      .set(bearer(customer.token))
      .send({ errandId: errand.id, reason: 'Wrong item delivered' })
      .expect(201);
    const rationale = 'Photos show the runner delivered the requested item.';
    await http()
      .patch(`/api/v1/errands/${errand.id}/resolve-dispute`)
      .set(bearer(admin.token))
      .send({ verdict: 'runner', rationale })
      .expect(200);
    for (const viewer of [customer, runner]) {
      const res = await http()
        .get(`/api/v1/errands/${errand.id}/dispute`)
        .set(bearer(viewer.token))
        .expect(200);
      expect(res.body).toMatchObject({
        status: 'resolved',
        resolution: rationale,
        verdict: 'runner_favourable',
        resolvedBy: null,
      });
      expect(res.body.resolvedAt).toBeTruthy();
      expect(JSON.stringify(res.body)).not.toContain(admin.id);
    }
    const asAdmin = await http()
      .get(`/api/v1/errands/${errand.id}/dispute`)
      .set(bearer(admin.token))
      .expect(200);
    expect(asAdmin.body.resolvedBy).toBe(admin.id);
  });
});
