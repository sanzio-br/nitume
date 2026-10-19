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
import { PaymentsService } from '../src/payments/payments.service';
import { deleteRunnerVerifications, readyRunner } from './support/runner-fixtures';
import { withAppendOnlyGuardLifted } from './support/test-database';

/**
 * Contract checks for the owner answers 5 (BOARD rows 95, 100, 102) and
 * spec gaps N-15, N-16. Every row created here is removed in afterAll.
 */
describe('Owner answers 5 (e2e)', () => {
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
      // Corrections are append-only (DB trigger): lift it for the cleanup only.
      await withAppendOnlyGuardLifted(ds, 'refund_payout_corrections', async (query) => {
        await query(
          `DELETE FROM "refund_payout_corrections" WHERE "refundReviewId" IN
             (SELECT id FROM "refund_reviews" WHERE "errandId" = ANY($1))`,
          [errandIds],
        );
      });
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

  const reviewOf = async (errandId: string) => {
    const rows: { id: string; trigger: string; status: string; amountPaid: string }[] = await db().query(
      'SELECT id, trigger, status, "amountPaid" FROM "refund_reviews" WHERE "errandId" = $1',
      [errandId],
    );
    return rows;
  };

  it('a paid task that EXPIRES opens a pending refund review (row 102, N-16)', async () => {
    const { customer, errand } = await paidAndAssigned();
    await app
      .get(ErrandsService)
      .transition(errand.id, ErrandStatus.EXPIRED, { type: StatusHistoryActor.SYSTEM }, 'No runner in time');
    const rows = await reviewOf(errand.id);
    expect(rows).toEqual([
      expect.objectContaining({ trigger: 'expired_after_payment', status: 'pending_review', amountPaid: '1000.00' }),
    ]);
    const view = await http().get(`/api/v1/errands/${errand.id}/refund`).set(bearer(customer.token)).expect(200);
    expect(view.body).toMatchObject({ trigger: 'expired_after_payment', status: 'pending_review', refundAmount: null });
  });

  it('a paid task that FAILS opens a review; corrections, reversal and re-send are audited (rows 100, 102)', async () => {
    const { customer, admin, runner, errand } = await paidAndAssigned();
    await setStatus(runner, errand.id, 'RUNNER_EN_ROUTE');
    await setStatus(runner, errand.id, 'FAILED');
    const [review] = await reviewOf(errand.id);
    expect(review).toMatchObject({ trigger: 'failed_after_payment', status: 'pending_review' });
    const id = review.id;

    // Not refunded yet: no corrections.
    const early = await http()
      .post(`/api/v1/refunds/${id}/corrections`)
      .set(bearer(admin.token))
      .send({ kind: 'corrected', newReference: 'QAA111BBB', reason: 'Wrong receipt', expectedLatestCorrectionId: null })
      .expect(409);
    expect(early.body.code).toBe('refund_not_refunded');

    await http().patch(`/api/v1/refunds/${id}/decision`).set(bearer(admin.token)).send({ refundAmount: 1000 }).expect(200);
    const ref1 = `QR5${Date.now().toString(36).toUpperCase()}`;
    const paid = await http()
      .post(`/api/v1/refunds/${id}/mark-paid`)
      .set(bearer(admin.token))
      .send({ payoutReference: ref1 })
      .expect(200);
    expect(paid.body.effectivePayout).toMatchObject({ state: 'sent', amount: '1000.00', reference: ref1 });

    // Customers and runners cannot record corrections.
    for (const actor of [customer, runner]) {
      await http()
        .post(`/api/v1/refunds/${id}/corrections`)
        .set(bearer(actor.token))
        .send({ kind: 'corrected', newAmount: 900, reason: 'Nope nope', expectedLatestCorrectionId: null })
        .expect(403);
    }
    // Validation: reason 5-500, unknown fields refused.
    await http()
      .post(`/api/v1/refunds/${id}/corrections`)
      .set(bearer(admin.token))
      .send({ kind: 'corrected', newAmount: 900, reason: 'abc', expectedLatestCorrectionId: null })
      .expect(400);
    await http()
      .post(`/api/v1/refunds/${id}/corrections`)
      .set(bearer(admin.token))
      .send({ kind: 'corrected', newAmount: 900, reason: 'Amount sent was lower' })
      .expect(400);

    const ref2 = `${ref1}X`;
    const corrected = await http()
      .post(`/api/v1/refunds/${id}/corrections`)
      .set(bearer(admin.token))
      .send({ kind: 'corrected', newReference: ref2.toLowerCase(), newAmount: 900, reason: 'Typed the wrong receipt', expectedLatestCorrectionId: null })
      .expect(201);
    expect(corrected.body).toMatchObject({
      status: 'refunded',
      payoutReference: ref1,
      effectivePayout: { state: 'sent', amount: '900.00', reference: ref2 },
      correctionCeiling: '1000.00',
    });
    const first = corrected.body.corrections[0];
    expect(first).toMatchObject({
      kind: 'corrected',
      previousReference: ref1,
      previousAmount: '1000.00',
      newReference: ref2,
      newAmount: '900.00',
      reason: 'Typed the wrong receipt',
      createdByUserId: admin.id,
      createdBy: { id: admin.id, displayName: 'Finance Ops' },
    });

    const stale = await http()
      .post(`/api/v1/refunds/${id}/corrections`)
      .set(bearer(admin.token))
      .send({ kind: 'reversed', newReference: 'REV5A1', reason: 'Wrong number', expectedLatestCorrectionId: null })
      .expect(409);
    expect(stale.body).toMatchObject({ code: 'payout_correction_conflict', latestCorrectionId: first.id });
    const reused = await http()
      .post(`/api/v1/refunds/${id}/corrections`)
      .set(bearer(admin.token))
      .send({ kind: 'reversed', newReference: ref1, reason: 'Wrong number', expectedLatestCorrectionId: first.id })
      .expect(409);
    expect(reused.body.code).toBe('payout_reference_reused');
    const over = await http()
      .post(`/api/v1/refunds/${id}/corrections`)
      .set(bearer(admin.token))
      .send({ kind: 'corrected', newAmount: 1000.01, reason: 'Sent more', expectedLatestCorrectionId: first.id })
      .expect(400);
    expect(over.body).toMatchObject({ code: 'refund_exceeds_amount_paid', correctionCeiling: '1000.00' });

    const revCode = `RV${Date.now().toString(36).toUpperCase()}`;
    const reversed = await http()
      .post(`/api/v1/refunds/${id}/corrections`)
      .set(bearer(admin.token))
      .send({ kind: 'reversed', newReference: revCode, reason: 'Wrong number, M-Pesa reversed it', expectedLatestCorrectionId: first.id })
      .expect(201);
    expect(reversed.body.effectivePayout).toMatchObject({ state: 'reversed', amount: '0.00', reference: null });
    const secondId = reversed.body.corrections[1].id as string;

    // Payout due again: listed and counted under status=approved.
    const due = await http().get('/api/v1/refunds?status=approved&limit=100').set(bearer(admin.token)).expect(200);
    expect(due.body.items.map((r: { id: string }) => r.id)).toContain(id);
    const dueItem = due.body.items.find((r: { id: string }) => r.id === id);
    expect(dueItem.effectivePayout.state).toBe('reversed');
    const refundedOnly = await http().get('/api/v1/refunds?status=refunded&limit=100').set(bearer(admin.token)).expect(200);
    expect(refundedOnly.body.items.map((r: { id: string }) => r.id)).toContain(id);
    const count = await http().get('/api/v1/refunds/count?status=approved').set(bearer(admin.token)).expect(200);
    expect(count.body.count).toBeGreaterThanOrEqual(1);

    const owed = await http().get(`/api/v1/errands/${errand.id}/refund`).set(bearer(customer.token)).expect(200);
    expect(owed.body).toMatchObject({ status: 'approved', refundAmount: '1000.00', paidAt: null });

    const again = await http()
      .post(`/api/v1/refunds/${id}/corrections`)
      .set(bearer(admin.token))
      .send({ kind: 'reversed', newReference: `${revCode}Z`, reason: 'Twice', expectedLatestCorrectionId: secondId })
      .expect(409);
    expect(again.body.code).toBe('payout_correction_kind_invalid');

    const ref3 = `${ref1}Y`;
    const resent = await http()
      .post(`/api/v1/refunds/${id}/corrections`)
      .set(bearer(admin.token))
      .send({ kind: 'resent', newReference: ref3, newAmount: 1000, reason: 'Sent to the right number', expectedLatestCorrectionId: secondId })
      .expect(201);
    expect(resent.body.effectivePayout).toMatchObject({ state: 'sent', amount: '1000.00', reference: ref3 });
    expect(resent.body.corrections[2]).toMatchObject({ kind: 'resent', previousReference: null, previousAmount: '0.00' });

    const view = await http().get(`/api/v1/errands/${errand.id}/refunds`).set(bearer(customer.token)).expect(200);
    expect(view.body.items[0]).toMatchObject({ status: 'refunded', refundAmount: '1000.00' });
    expect(view.body.items[0].paidAt).toBe(resent.body.corrections[2].createdAt);
    const json = JSON.stringify(view.body);
    for (const hidden of [ref1, ref2, ref3, revCode, 'Wrong number', admin.id, 'corrections']) {
      expect(json).not.toContain(hidden);
    }

    // Original receipt untouched; table is append-only at the DB level.
    const [stored] = await db().query('SELECT "payoutReference" FROM "refund_reviews" WHERE id = $1', [id]);
    expect(stored.payoutReference).toBe(ref1);
    await expect(
      db().query(`UPDATE "refund_payout_corrections" SET reason = 'x' WHERE "refundReviewId" = $1`, [id]),
    ).rejects.toThrow(/append-only/);
    await expect(
      db().query('DELETE FROM "refund_payout_corrections" WHERE "refundReviewId" = $1', [id]),
    ).rejects.toThrow(/append-only/);

    // AQ-9 default: mark-paid and the re-send notify; correction and reversal do not.
    let sent: unknown[] = [];
    for (let i = 0; i < 40 && sent.length < 2; i += 1) {
      await new Promise((r) => setTimeout(r, 250));
      sent = await db().query(
        'SELECT 1 FROM "notifications" WHERE "userId" = $1 AND "eventType" = $2',
        [customer.id, 'refund.refunded'],
      );
    }
    await new Promise((r) => setTimeout(r, 750));
    sent = await db().query(
      'SELECT 1 FROM "notifications" WHERE "userId" = $1 AND "eventType" = $2',
      [customer.id, 'refund.refunded'],
    );
    expect(sent).toHaveLength(2);
    const approvedAgain: unknown[] = await db().query(
      'SELECT 1 FROM "notifications" WHERE "userId" = $1 AND "eventType" = $2',
      [customer.id, 'refund.approved'],
    );
    expect(approvedAgain).toHaveLength(1);
  });

  it('nothing is payable to the runner before CONFIRMED on a send_to_runner task (row 95)', async () => {
    const { runner, errand } = await paidAndAssigned();
    for (const to of ['RUNNER_EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'AWAITING_CUSTOMER']) {
      await setStatus(runner, errand.id, to);
    }
    const payments = app.get(PaymentsService);
    await expect(payments.settleErrand(errand.id)).rejects.toMatchObject({ code: 'errand_not_settleable' });
    const legs: { code: string }[] = await db().query(
      `SELECT pt.code FROM "payment_transactions" t
         JOIN "payments" p ON p.id = t."paymentId"
         JOIN "payment_type" pt ON pt.id = t."paymentTypeId"
        WHERE p."errandId" = $1`,
      [errand.id],
    );
    expect(legs.map((l) => l.code)).not.toContain('runner_advance');
    const [row] = await db().query('SELECT status FROM "errands" WHERE id = $1', [errand.id]);
    expect(row.status).toBe('AWAITING_CUSTOMER');
  });
});
