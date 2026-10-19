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
 * Contract checks for the owner answers 3 (BOARD rows 71-75) and admin spec
 * gaps N-1..N-8: several refund reviews per task, re-quote on ACCEPTED with
 * explicit acceptance, provider callback parsing, dispute row closing,
 * refund admin views and 409 codes. Every row created here is removed in
 * afterAll.
 */
describe('Owner answers 3 (e2e)', () => {
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

  it('re-quotes an ACCEPTED errand; payment waits for the customer to accept it (row 72, N-4, N-5)', async () => {
    const customer = await makeUser(UserRole.CUSTOMER);
    const admin = await makeUser(UserRole.ADMIN);
    const errand = await createErrand(customer);
    const soon = new Date(Date.now() + 3_600_000).toISOString();
    await submitAndQuote(customer, admin, errand.id, soon);

    // Explicit accept endpoint on QUOTED: QUOTED -> ACCEPTED.
    const accepted = await http()
      .post(`/api/v1/errands/${errand.id}/quote/accept`)
      .set(bearer(customer.token))
      .expect(200);
    expect(accepted.body.errand.status).toBe('ACCEPTED');
    expect(accepted.body.quote.acceptedAt).toBeTruthy();

    // Still valid: no re-quote.
    const still = await http()
      .post(`/api/v1/errands/${errand.id}/quote`)
      .set(bearer(admin.token))
      .send({ total: 1200 })
      .expect(409);
    expect(still.body.code).toBe('quote_still_valid');

    await expireQuote(errand.id);
    const requote = await http()
      .post(`/api/v1/errands/${errand.id}/quote`)
      .set(bearer(admin.token))
      .send({ total: 1200, expiresAt: soon })
      .expect(201);
    expect(requote.body.errand.status).toBe('ACCEPTED');
    expect(requote.body.history).toBeNull();

    const detail = await http().get(`/api/v1/errands/${errand.id}`).set(bearer(customer.token)).expect(200);
    expect(detail.body.quoteAcceptanceRequired).toBe(true);
    expect(detail.body.quoteExpiresAt).toBe(soon);
    expect(detail.body.feeTotal).toBe('600.00');
    const list = await http().get('/api/v1/errands').set(bearer(customer.token)).expect(200);
    const item = list.body.items.find((e: { id: string }) => e.id === errand.id);
    expect(item.quoteExpiresAt).toBe(soon);

    const blocked = await http()
      .post(`/api/v1/payments/${errand.id}/initiate`)
      .set(bearer(customer.token))
      .send({})
      .expect(409);
    expect(blocked.body.code).toBe('quote_not_accepted');

    expect(await feedRow(customer.id, 'quote.reissued')).toMatchObject({ errandId: errand.id });

    await http().post(`/api/v1/errands/${errand.id}/quote/accept`).set(bearer(customer.token)).expect(200);
    // Idempotent.
    await http().post(`/api/v1/errands/${errand.id}/quote/accept`).set(bearer(customer.token)).expect(200);
    const init = await http()
      .post(`/api/v1/payments/${errand.id}/initiate`)
      .set(bearer(customer.token))
      .send({})
      .expect(201);
    // Fees from the newest quote: 20% + 30% of 1200.
    expect(Number(init.body.payment.serviceFee) + Number(init.body.payment.runnerFee)).toBe(600);

    // A pending payment blocks another re-quote.
    await expireQuote(errand.id);
    const busy = await http()
      .post(`/api/v1/errands/${errand.id}/quote`)
      .set(bearer(admin.token))
      .send({ total: 1300 })
      .expect(409);
    expect(busy.body.code).toBe('payment_in_progress');
  });

  it('opens one refund review per approved price decrease (row 71) with admin views (N-1, N-2, N-7)', async () => {
    const customer = await makeUser(UserRole.CUSTOMER, 'Amina Wanjiru');
    const admin = await makeUser(UserRole.ADMIN, 'Ops Lead');
    const runner = await makeUser(UserRole.RUNNER);
    const errand = await createErrand(customer, buyForMe);
    await toInProgress({ customer, admin, runner }, errand.id);

    const decide = async (toPrice: number) => {
      const req = await http()
        .post(`/api/v1/errands/${errand.id}/price-change`)
        .set(bearer(runner.token))
        .send({ toPrice, reason: 'Cheaper at the shop' })
        .expect(201);
      const res = await http()
        .post(`/api/v1/errands/${errand.id}/price-change/${req.body.id}/approve`)
        .set(bearer(customer.token))
        .send({})
        .expect(201);
      return { requestId: req.body.id as string, body: res.body };
    };

    const first = await decide(420);
    expect(first.body.refundReview).toMatchObject({
      trigger: 'price_change_decrease',
      priceChangeRequestId: first.requestId,
      amountPaid: '80.00',
      status: 'pending_review',
      refundAmount: null,
    });
    const second = await decide(400);
    expect(second.body.refundReview).toMatchObject({ amountPaid: '20.00', trigger: 'price_change_decrease' });
    const increase = await decide(450);
    expect(increase.body.refundReview).toBeNull();

    const all = await http().get(`/api/v1/errands/${errand.id}/refunds`).set(bearer(customer.token)).expect(200);
    expect(all.body.items).toHaveLength(2);
    expect(all.body.items.map((r: { amountPaid: string }) => r.amountPaid).sort()).toEqual(['20.00', '80.00']);
    expect(all.body.items[0]).not.toHaveProperty('decisionNote');
    const one = await http().get(`/api/v1/errands/${errand.id}/refund`).set(bearer(customer.token)).expect(200);
    expect(one.body.id).toBe(second.body.refundReview.id);

    const reviewId = first.body.refundReview.id as string;
    await http()
      .patch(`/api/v1/refunds/${reviewId}/decision`)
      .set(bearer(admin.token))
      .send({ refundAmount: 80 })
      .expect(200);
    const over = await http()
      .patch(`/api/v1/refunds/${second.body.refundReview.id}/decision`)
      .set(bearer(admin.token))
      .send({ refundAmount: 21 })
      .expect(400);
    expect(over.body.code).toBe('refund_exceeds_amount_paid');

    const detail = await http().get(`/api/v1/refunds/${reviewId}`).set(bearer(admin.token)).expect(200);
    expect(detail.body.errand).toMatchObject({ id: errand.id, category: 'buy_for_me', status: 'IN_PROGRESS' });
    expect(detail.body.decidedBy).toEqual({ id: admin.id, displayName: 'Ops Lead' });
    expect(detail.body.paidBy).toBeNull();
    expect(detail.body.customer).toMatchObject({ userId: customer.id, shortName: 'Amina W.' });
    expect(detail.body.customer.mpesaPhone).toMatch(/^\+2547/);
    expect(detail.body.paid).toEqual({
      serviceAndRunnerFee: '500.00',
      itemAmountToNitume: '500.00',
      priceChangeDifferences: '0.00',
      totalPaidToNitume: '1000.00',
      merchantDirectAmount: '0.00',
    });
    expect(detail.body.otherReviews).toHaveLength(1);

    const list = await http().get('/api/v1/refunds?limit=100').set(bearer(admin.token)).expect(200);
    const item = list.body.items.find((r: { id: string }) => r.id === reviewId);
    expect(item.errand).toMatchObject({ id: errand.id });
    expect(item.decidedBy).toEqual({ id: admin.id, displayName: 'Ops Lead' });

    const count = await http()
      .get('/api/v1/refunds/count?status=pending_review')
      .set(bearer(admin.token))
      .expect(200);
    expect(count.body.count).toBeGreaterThanOrEqual(1);
    await http().get('/api/v1/refunds/count').set(bearer(customer.token)).expect(403);

    // The customer's later reject-and-cancel opens the cancellation review alongside.
    const pc = await http()
      .post(`/api/v1/errands/${errand.id}/price-change`)
      .set(bearer(runner.token))
      .send({ toPrice: 900 })
      .expect(201);
    const reject = await http()
      .post(`/api/v1/errands/${errand.id}/price-change/${pc.body.id}/reject`)
      .set(bearer(customer.token))
      .expect(201);
    expect(reject.body.refundReview).toMatchObject({ trigger: 'price_change_rejected', priceChangeRequestId: null });
    const after = await http().get(`/api/v1/errands/${errand.id}/refunds`).set(bearer(customer.token)).expect(200);
    expect(after.body.items).toHaveLength(3);
    const cancelView = await http()
      .get(`/api/v1/errands/${errand.id}/refund`)
      .set(bearer(customer.token))
      .expect(200);
    expect(cancelView.body.trigger).toBe('price_change_rejected');
  });

  it('closes the disputes row on resolve-dispute (N-6) and codes the 409s (N-8)', async () => {
    const customer = await makeUser(UserRole.CUSTOMER);
    const admin = await makeUser(UserRole.ADMIN);
    const runner = await makeUser(UserRole.RUNNER);
    const errand = await createErrand(customer);
    await toInProgress({ customer, admin, runner }, errand.id);
    await setStatus(runner, errand.id, 'AWAITING_CUSTOMER');

    const notDisputed = await http()
      .patch(`/api/v1/errands/${errand.id}/resolve-dispute`)
      .set(bearer(admin.token))
      .send({ verdict: 'runner', rationale: 'Runner delivered exactly what was asked for.' })
      .expect(409);
    expect(notDisputed.body.code).toBe('errand_not_disputed');

    await http()
      .post('/api/v1/disputes')
      .set(bearer(customer.token))
      .send({ errandId: errand.id, reason: 'Wrong item delivered' })
      .expect(201);
    const again = await http()
      .post('/api/v1/disputes')
      .set(bearer(customer.token))
      .send({ errandId: errand.id, reason: 'Wrong item delivered' })
      .expect(409);
    expect(again.body.code).toBe('dispute_already_exists');

    const rationale = 'Photos show the runner delivered the requested item.';
    await http()
      .patch(`/api/v1/errands/${errand.id}/resolve-dispute`)
      .set(bearer(admin.token))
      .send({ verdict: 'runner', rationale })
      .expect(200);
    const dispute = await http()
      .get(`/api/v1/errands/${errand.id}/dispute`)
      .set(bearer(customer.token))
      .expect(200);
    // Row 79: the parties see the note and verdict, not the admin id.
    expect(dispute.body).toMatchObject({
      status: 'resolved',
      resolution: rationale,
      resolvedBy: null,
      verdict: 'runner_favourable',
    });
    expect(dispute.body.events.map((e: { eventType: string }) => e.eventType)).toEqual(['opened', 'resolved']);
    expect(dispute.body.events[1].payload).toMatchObject({ verdict: 'runner_favourable' });

    const illegal = await setStatus(customer, errand.id, 'DRAFT', 409);
    expect(illegal.body).toMatchObject({ code: 'illegal_transition', from: 'COMPLETED', to: 'DRAFT' });
  });

  it('notifies the customer when merchant details are added', async () => {
    const customer = await makeUser(UserRole.CUSTOMER);
    const admin = await makeUser(UserRole.ADMIN);
    const errand = await createErrand(customer, buyForMe);
    await http().post(`/api/v1/errands/${errand.id}/submit`).set(bearer(customer.token)).expect(201);
    await http()
      .put(`/api/v1/errands/${errand.id}/merchant-details`)
      .set(bearer(admin.token))
      .send({ merchantName: 'Naivas Nyali', tillNumber: '123456' })
      .expect(200);
    const row = await feedRow(customer.id, 'merchant_details.added');
    expect(row).toMatchObject({ errandId: errand.id, title: 'Merchant payment details added' });
  });

  it('answers 400 callback_unrecognised for a body the provider cannot parse (row 73)', async () => {
    const res = await http().post('/api/v1/payments/mpesa/callback').send({ hello: 'world' }).expect(400);
    expect(res.body.code).toBe('callback_unrecognised');
    await http()
      .post('/api/v1/payments/mpesa/callback')
      .send({ reference: 'NTM-DOES-NOT-EXIST', resultCode: 0 })
      .expect(404);
  });
});
