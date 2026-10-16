import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { ErrandStatus, StatusHistoryActor, UserRole } from '../src/common/enums';
import { ErrandsService } from '../src/errands/errands.service';
import { CustomersService } from '../src/customers/customers.service';
import { RunnersService } from '../src/runners/runners.service';
import { UsersService } from '../src/users/users.service';
import { PaymentsService } from '../src/payments/payments.service';
import { deleteRunnerVerifications, readyRunner } from './support/runner-fixtures';

/**
 * Contract checks for the owner answers 7 (BOARD rows 140, 141: a
 * runner-favour dispute keeps the runner's payout lines; an offer lapsing
 * unaccepted expires the offer, and per row 157 the task stays
 * RUNNER_ASSIGNED for reassignment). Every row created here is removed in
 * afterAll.
 */
describe('Owner answers 7 (e2e)', () => {
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


  const upload = (actor: Actor, errandId: string, type = 'receipt') =>
    http()
      .post(`/api/v1/errands/${errandId}/evidence`)
      .set(bearer(actor.token))
      .send({ type, contentType: 'image/png', data: Buffer.from('receipt-bytes').toString('base64') })
      .expect(201);

  const linesOf = async (errandId: string) =>
    (await db().query(
      `SELECT id, kind, status, amount, "requestedAmount", "reviewReason", "runnerProfileId"
         FROM "runner_payout_lines" WHERE "errandId" = $1 ORDER BY kind::text`,
      [errandId],
    )) as { id: string; kind: string; status: string; amount: string | null; requestedAmount: string; reviewReason: string | null }[];

  const assignmentOf = async (errandId: string) =>
    (
      (await db().query(
        `SELECT id, status, "offerExpiresAt" FROM "errand_assignments" WHERE "errandId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
        [errandId],
      )) as { id: string; status: string; offerExpiresAt: Date | null }[]
    )[0];

  const lapse = (errandId: string) =>
    db().query(
      `UPDATE "errand_assignments" SET "offerExpiresAt" = now() - interval '1 second' WHERE "errandId" = $1`,
      [errandId],
    );

  it('an admin offer is open 10 minutes; once it lapses the accept is refused, the offer expires and the task stays RUNNER_ASSIGNED for reassignment (rows 114, 141, 157)', async () => {
    const { customer, admin, runner, errand } = await paidAndAssigned();
    const detail = await http().get(`/api/v1/errands/${errand.id}`).set(bearer(runner.token)).expect(200);
    const deadline = new Date(detail.body.assignment.offerExpiresAt).getTime();
    expect(Math.abs(deadline - (Date.now() + 600_000))).toBeLessThan(30_000);

    // Still open: the sweep leaves it alone.
    expect(await app.get(ErrandsService).expireLapsedOffers()).not.toContain(errand.id);

    await lapse(errand.id);
    const late = await setStatus(runner, errand.id, 'RUNNER_EN_ROUTE', 409);
    expect(late.body).toMatchObject({ code: 'offer_expired' });
    expect(typeof late.body.offerExpiresAt).toBe('string');

    expect(await app.get(ErrandsService).expireLapsedOffers()).toContain(errand.id);
    const after = await http().get(`/api/v1/errands/${errand.id}`).set(bearer(customer.token)).expect(200);
    expect(after.body.status).toBe('RUNNER_ASSIGNED');
    expect(after.body.assignment).toBeNull();
    expect(await assignmentOf(errand.id)).toMatchObject({ status: 'expired' });
    // No status change, so no history row and no refund review (row 157).
    const history = (await db().query(
      `SELECT "toStatus" FROM "errand_status_history" WHERE "errandId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
      [errand.id],
    )) as { toStatus: string }[];
    expect(history[0].toStatus).toBe('RUNNER_ASSIGNED');
    expect(await db().query('SELECT id FROM "refund_reviews" WHERE "errandId" = $1', [errand.id])).toEqual([]);

    // The runner has lost the task: the accept is still 409 offer_expired.
    const again = await setStatus(runner, errand.id, 'RUNNER_EN_ROUTE', 409);
    expect(again.body).toMatchObject({ code: 'offer_expired', offerExpiresAt: late.body.offerExpiresAt });
    expect(await app.get(ErrandsService).isCurrentRunner(errand.id, runner.id)).toBe(false);
    // Idempotent: a second sweep expires nothing more.
    expect(await app.get(ErrandsService).expireLapsedOffers()).not.toContain(errand.id);

    // The admin offers the task to another runner, as after a decline.
    const other = await makeUser(UserRole.RUNNER);
    const reassigned = await http()
      .post(`/api/v1/errands/${errand.id}/assign`)
      .set(bearer(admin.token))
      .send({ runnerProfileId: other.profileId })
      .expect(201);
    expect(reassigned.body.history).toBeNull();
    const fresh = await assignmentOf(errand.id);
    expect(fresh.status).toBe('assigned');
    expect(new Date(fresh.offerExpiresAt as Date).getTime()).toBeGreaterThan(Date.now() + 540_000);
    await setStatus(other, errand.id, 'RUNNER_EN_ROUTE');
  });

  it('the admin can reassign a lapsed offer before the sweep reaches it (row 157)', async () => {
    const { admin, runner, errand } = await paidAndAssigned();
    await lapse(errand.id);
    const other = await makeUser(UserRole.RUNNER);
    await http()
      .post(`/api/v1/errands/${errand.id}/assign`)
      .set(bearer(admin.token))
      .send({ runnerProfileId: other.profileId })
      .expect(201);
    const rows = (await db().query(
      `SELECT "runnerProfileId", status FROM "errand_assignments" WHERE "errandId" = $1 ORDER BY "createdAt"`,
      [errand.id],
    )) as { runnerProfileId: string; status: string }[];
    expect(rows).toEqual([
      { runnerProfileId: runner.profileId, status: 'expired' },
      { runnerProfileId: other.profileId, status: 'assigned' },
    ]);
    expect(await app.get(ErrandsService).expireLapsedOffers()).not.toContain(errand.id);
    const late = await setStatus(runner, errand.id, 'RUNNER_EN_ROUTE', 409);
    expect(late.body.code).toBe('offer_expired');
  });

  it('an accept and an admin reassign racing the expiry sweep wait for its row lock (reviewer B1, row 157)', async () => {
    const { admin, runner, errand } = await paidAndAssigned();
    const other = await makeUser(UserRole.RUNNER);
    await lapse(errand.id);
    const service = app.get(ErrandsService);
    const racers: Promise<request.Response>[] = [];
    const original = service.activeAssignmentFor.bind(service);
    const spy = vi.spyOn(service, 'activeAssignmentFor').mockImplementation(async (errandId, manager) => {
      if (errandId === errand.id && manager && racers.length === 0) {
        // The sweep holds the errand row lock here and has not committed yet.
        racers.push(
          http().patch(`/api/v1/errands/${errand.id}/status`).set(bearer(runner.token)).send({ to: 'RUNNER_EN_ROUTE' }).then((r) => r),
          http()
            .post(`/api/v1/errands/${errand.id}/assign`)
            .set(bearer(admin.token))
            .send({ runnerProfileId: other.profileId })
            .then((r) => r),
        );
        await new Promise((r) => setTimeout(r, 500));
      }
      return original(errandId, manager);
    });
    try {
      expect(await service.expireLapsedOffers()).toContain(errand.id);
      const [accept, assign] = await Promise.all(racers);
      expect([accept.status, accept.body.code]).toEqual([409, 'offer_expired']);
      expect(assign.status).toBe(201);
    } finally {
      spy.mockRestore();
    }
    const row = (await db().query('SELECT status FROM "errands" WHERE id = $1', [errand.id])) as { status: string }[];
    expect(row[0].status).toBe('RUNNER_ASSIGNED');
    const rows = (await db().query(
      `SELECT "runnerProfileId", status FROM "errand_assignments" WHERE "errandId" = $1 ORDER BY "createdAt"`,
      [errand.id],
    )) as { runnerProfileId: string; status: string }[];
    expect(rows).toEqual([
      { runnerProfileId: runner.profileId, status: 'expired' },
      { runnerProfileId: other.profileId, status: 'assigned' },
    ]);
    const fromAssigned = (await db().query(
      `SELECT "toStatus" FROM "errand_status_history" WHERE "errandId" = $1 AND "fromStatus" = 'RUNNER_ASSIGNED'`,
      [errand.id],
    )) as { toStatus: string }[];
    expect(fromAssigned).toEqual([]);
  });

  it('an offer accepted in time is not expired by the sweep (row 141)', async () => {
    const { runner, errand } = await paidAndAssigned();
    await setStatus(runner, errand.id, 'RUNNER_EN_ROUTE');
    const accepted = await http().get(`/api/v1/errands/${errand.id}`).set(bearer(runner.token)).expect(200);
    expect(accepted.body.assignment).toMatchObject({ status: 'accepted' });
    await lapse(errand.id);
    expect(await app.get(ErrandsService).expireLapsedOffers()).not.toContain(errand.id);
    const res = await http().get(`/api/v1/errands/${errand.id}`).set(bearer(runner.token)).expect(200);
    expect(res.body.status).toBe('RUNNER_EN_ROUTE');
  });

  it('a reassigned task gets a fresh 10-minute offer (rows 108, 141)', async () => {
    const { admin, runner, errand } = await paidAndAssigned();
    await db().query('UPDATE "runner_profiles" SET "maxPurchaseAdvance" = 100 WHERE id = $1', [runner.profileId]);
    await http()
      .post(`/api/v1/errands/${errand.id}/assignment/decline`)
      .set(bearer(runner.token))
      .send({ reason: 'over_purchase_limit' })
      .expect(200);
    // A declined offer is decided, so the sweep leaves the task for the admin.
    await lapse(errand.id);
    expect(await app.get(ErrandsService).expireLapsedOffers()).not.toContain(errand.id);
    const other = await makeUser(UserRole.RUNNER);
    await http()
      .post(`/api/v1/errands/${errand.id}/assign`)
      .set(bearer(admin.token))
      .send({ runnerProfileId: other.profileId })
      .expect(201);
    const fresh = await assignmentOf(errand.id);
    expect(fresh.status).toBe('assigned');
    expect(new Date(fresh.offerExpiresAt as Date).getTime()).toBeGreaterThan(Date.now() + 540_000);
    await setStatus(other, errand.id, 'RUNNER_EN_ROUTE');
  });

  it('a dispute decided for the runner keeps the runner fee and item reimbursement (row 140)', async () => {
    const { customer, admin, runner, errand } = await paidAndAssigned();
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
    await http()
      .patch(`/api/v1/errands/${errand.id}/resolve-dispute`)
      .set(bearer(admin.token))
      .send({ verdict: 'runner', rationale: 'Receipt and photos show the runner bought the right item.' })
      .expect(200);
    const resolved = await http().get(`/api/v1/errands/${errand.id}`).set(bearer(customer.token)).expect(200);
    expect(resolved.body.status).toBe('COMPLETED');
    expect(await linesOf(errand.id)).toEqual([]);
    // The new dispute window closes (system): COMPLETED -> CONFIRMED.
    await app
      .get(ErrandsService)
      .transition(errand.id, ErrandStatus.CONFIRMED, { type: StatusHistoryActor.SYSTEM }, 'Dispute window passed');
    expect(await linesOf(errand.id)).toEqual([
      expect.objectContaining({ kind: 'item_reimbursement', status: 'payable', amount: '500.00', reviewReason: null }),
      expect.objectContaining({ kind: 'runner_fee', status: 'payable', amount: '300.00' }),
    ]);
    const earnings = await http().get('/api/v1/runners/me/earnings').set(bearer(runner.token)).expect(200);
    expect(earnings.body).toMatchObject({ availableAmount: '800.00', onHoldAmount: '0.00' });
    // No refund review: the verdict went the runner's way.
    expect(await db().query('SELECT id FROM "refund_reviews" WHERE "errandId" = $1', [errand.id])).toEqual([]);
    // Settling keeps the lines.
    await app.get(PaymentsService).settleErrand(errand.id);
    expect((await linesOf(errand.id)).map((l) => l.status)).toEqual(['payable', 'payable']);
  });
});
