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
 * Contract checks for the owner answers of 2026-10-08 (BOARD rows 25-65):
 * rating access, shortName, quote expiry, budgets, refund status, price
 * difference retries, failure reasons and evidence links. Every row created
 * here is removed again in afterAll.
 */
describe('Owner answers 2 (e2e)', () => {
  let app: INestApplication<App>;
  let baseUrl: string;
  const userIds: string[] = [];
  const errandIds: string[] = [];
  const otpPhones: string[] = [];

  const randomPhone = (): string =>
    `+2547${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;

  const tokenFor = (user: {
    id: string;
    role: UserRole;
    phone: string;
  }): string =>
    new JwtService().sign(
      { sub: user.id, role: user.role, phone: user.phone, type: 'access' },
      {
        secret: app
          .get(ConfigService)
          .get<string>('jwt.accessSecret') as string,
        expiresIn: '5m',
      },
    );

  const makeUser = async (
    role: UserRole,
  ): Promise<{ id: string; token: string; profileId: string | null }> => {
    const user = await app
      .get(UsersService)
      .create({ phone: randomPhone(), role });
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
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    // Bind explicitly: an implicit ephemeral listen can collide with other
    // local servers on another address family and route requests elsewhere.
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
      // Payments reference price_change_requests: remove them first.
      await ds.query('DELETE FROM "payments" WHERE "errandId" = ANY($1)', [
        errandIds,
      ]);
      const tables: { table_name: string }[] = await ds.query(
        `SELECT table_name FROM information_schema.columns
          WHERE table_schema = 'public' AND column_name = 'errandId'
            AND table_name <> 'errands'`,
      );
      for (const { table_name } of tables) {
        await ds.query(
          `DELETE FROM "${table_name}" WHERE "errandId" = ANY($1)`,
          [errandIds],
        );
      }
      await ds.query('DELETE FROM "errands" WHERE id = ANY($1)', [errandIds]);
    }
    if (otpPhones.length > 0) {
      await ds.query('DELETE FROM "otp_codes" WHERE target = ANY($1)', [
        otpPhones,
      ]);
    }
    if (userIds.length > 0) {
      await ds.query('DELETE FROM "notifications" WHERE "userId" = ANY($1)', [
        userIds,
      ]);
      await ds.query(
        `DELETE FROM "payment_methods" WHERE "customerProfileId" IN
           (SELECT id FROM "customer_profiles" WHERE "userId" = ANY($1))`,
        [userIds],
      );
      await deleteRunnerVerifications(ds, userIds);
      await ds.query('DELETE FROM "runner_profiles" WHERE "userId" = ANY($1)', [
        userIds,
      ]);
      await ds.query(
        'DELETE FROM "customer_profiles" WHERE "userId" = ANY($1)',
        [userIds],
      );
      await ds.query('DELETE FROM "users" WHERE "id" = ANY($1)', [userIds]);
    }
    await app.close();
  });

  const http = () => request(baseUrl);
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  type Actor = { id: string; token: string; profileId: string | null };

  const createErrand = async (
    customer: Actor,
    body: Record<string, unknown> = {},
  ): Promise<Record<string, any>> => {
    const res = await http()
      .post('/api/v1/errands')
      .set(bearer(customer.token))
      .send({
        category: 'inspection',
        description: 'Check the apartment in Nyali',
        budget: 0,
        locations: [
          {
            pointType: 'task_site',
            lat: -4.04,
            lon: 39.7,
            addressText: 'Links Road, Nyali',
          },
        ],
        ...body,
      })
      .expect(201);
    errandIds.push(res.body.errand.id);
    return res.body.errand;
  };

  const setStatus = async (
    actor: Actor,
    errandId: string,
    to: string,
    expected = 200,
  ) =>
    http()
      .patch(`/api/v1/errands/${errandId}/status`)
      .set(bearer(actor.token))
      .send({ to })
      .expect(expected);

  /**
   * Drives an errand through submit → quote → accept → pay → assign and,
   * optionally, the runner steps up to `until`.
   */
  const driveTo = async (
    parties: { customer: Actor; admin: Actor; runner: Actor },
    errandId: string,
    until: 'RUNNER_ASSIGNED' | 'IN_PROGRESS' | 'AWAITING_CUSTOMER',
    initiateBody: Record<string, unknown> = {},
  ): Promise<void> => {
    const { customer, admin, runner } = parties;
    await http()
      .post(`/api/v1/errands/${errandId}/submit`)
      .set(bearer(customer.token))
      .expect(201);
    await http()
      .post(`/api/v1/errands/${errandId}/quote`)
      .set(bearer(admin.token))
      .send({ total: 1000, baseFee: 600, distanceFee: 400 })
      .expect(201);
    await setStatus(customer, errandId, 'ACCEPTED');
    const init = await http()
      .post(`/api/v1/payments/${errandId}/initiate`)
      .set(bearer(customer.token))
      .send(initiateBody)
      .expect(201);
    await http()
      .post('/api/v1/payments/mpesa/callback')
      .send({ reference: init.body.reference, resultCode: 0 })
      .expect(201);
    await http()
      .post(`/api/v1/errands/${errandId}/assign`)
      .set(bearer(admin.token))
      .send({ runnerProfileId: runner.profileId })
      .expect(201);
    if (until === 'RUNNER_ASSIGNED') return;
    for (const to of ['RUNNER_EN_ROUTE', 'ARRIVED', 'IN_PROGRESS']) {
      await setStatus(runner, errandId, to);
    }
    if (until === 'IN_PROGRESS') return;
    await runnerPhoto(baseUrl, runner.token, errandId);
    await setStatus(runner, errandId, 'AWAITING_CUSTOMER');
  };

  const buyForMe = {
    category: 'buy_for_me',
    budget: 500,
    locations: [
      {
        pointType: 'dropoff',
        lat: -4.04,
        lon: 39.7,
        addressText: 'Links Road, Nyali',
      },
    ],
  };

  it('guards GET /errands/:id/rating by errand access (row 28)', async () => {
    const customer = await makeUser(UserRole.CUSTOMER);
    const stranger = await makeUser(UserRole.CUSTOMER);
    const errand = await createErrand(customer);
    await http()
      .post(`/api/v1/errands/${errand.id}/submit`)
      .set(bearer(customer.token))
      .expect(201);
    await http()
      .get(`/api/v1/errands/${errand.id}/rating`)
      .set(bearer(customer.token))
      .expect(200);
    await http()
      .get(`/api/v1/errands/${errand.id}/rating`)
      .set(bearer(stranger.token))
      .expect(403);
  });

  it('accepts a budget only for Buy For Me and Get It For Me (row 45)', async () => {
    const customer = await makeUser(UserRole.CUSTOMER);
    const bad = await http()
      .post('/api/v1/errands')
      .set(bearer(customer.token))
      .send({
        category: 'inspection',
        description: 'Check the apartment in Nyali',
        budget: 100,
        locations: [
          {
            pointType: 'task_site',
            lat: -4.04,
            lon: 39.7,
            addressText: 'Links Road',
          },
        ],
      })
      .expect(400);
    expect(bad.body.code).toBe('budget_not_applicable');
    const noBudget = await http()
      .post('/api/v1/errands')
      .set(bearer(customer.token))
      .send({
        ...buyForMe,
        budget: undefined,
        description: 'Buy two loaves of bread',
      })
      .expect(400);
    expect(noBudget.body.code).toBe('budget_required');
    const noCoords = await http()
      .post('/api/v1/errands')
      .set(bearer(customer.token))
      .send({
        ...buyForMe,
        description: 'Buy two loaves of bread',
        locations: [{ pointType: 'dropoff', addressText: 'Links Road, Nyali' }],
      })
      .expect(400);
    expect(JSON.stringify(noCoords.body.message)).toMatch(/lat|lon/);
  });

  it('refuses an expired quote with quote_expired until an admin re-quotes (row 46)', async () => {
    const customer = await makeUser(UserRole.CUSTOMER);
    const admin = await makeUser(UserRole.ADMIN);
    const errand = await createErrand(customer);
    await http()
      .post(`/api/v1/errands/${errand.id}/submit`)
      .set(bearer(customer.token))
      .expect(201);
    await http()
      .post(`/api/v1/errands/${errand.id}/quote`)
      .set(bearer(admin.token))
      .send({
        total: 1000,
        expiresAt: new Date(Date.now() + 1500).toISOString(),
      })
      .expect(201);
    const early = await http()
      .post(`/api/v1/errands/${errand.id}/quote`)
      .set(bearer(admin.token))
      .send({ total: 1200 })
      .expect(409);
    expect(early.body.code).toBe('quote_still_valid');
    await new Promise((r) => setTimeout(r, 1600));
    const expired = await setStatus(customer, errand.id, 'ACCEPTED', 409);
    expect(expired.body.code).toBe('quote_expired');
    expect(expired.body.expiresAt).toBeTruthy();
    const fresh = await http()
      .post(`/api/v1/errands/${errand.id}/quote`)
      .set(bearer(admin.token))
      .send({
        total: 1200,
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      })
      .expect(201);
    expect(fresh.body.errand.status).toBe('QUOTED');
    expect(fresh.body.history).toBeNull();
    const quote = await http()
      .get(`/api/v1/errands/${errand.id}/quote`)
      .set(bearer(customer.token))
      .expect(200);
    expect(quote.body.total).toBe('1200.00');
    await setStatus(customer, errand.id, 'ACCEPTED');
    const detail = await http()
      .get(`/api/v1/errands/${errand.id}`)
      .set(bearer(customer.token))
      .expect(200);
    expect(detail.body.feeTotal).toBe('600.00');
    expect(detail.body.merchantDetailsAvailable).toBe(false);
  });

  it('puts shortName on the assignment runner and public profile (row 40)', async () => {
    const customer = await makeUser(UserRole.CUSTOMER);
    const admin = await makeUser(UserRole.ADMIN);
    const runner = await makeUser(UserRole.RUNNER);
    await http()
      .patch('/api/v1/users/me')
      .set(bearer(runner.token))
      .send({ displayName: 'Kevin Otieno' })
      .expect(200);
    const errand = await createErrand(customer);
    await driveTo({ customer, admin, runner }, errand.id, 'RUNNER_ASSIGNED');
    // Row 183: the customer sees the runner only once the offer is accepted.
    const offered = await http().get(`/api/v1/errands/${errand.id}`).set(bearer(customer.token)).expect(200);
    expect(offered.body.assignment).toBeNull();
    await http()
      .patch(`/api/v1/errands/${errand.id}/status`)
      .set(bearer(runner.token))
      .send({ to: 'RUNNER_EN_ROUTE' })
      .expect(200);
    const detail = await http()
      .get(`/api/v1/errands/${errand.id}`)
      .set(bearer(customer.token))
      .expect(200);
    expect(detail.body.assignment.runner.shortName).toBe('Kevin O.');
    const profile = await http()
      .get(`/api/v1/runners/${runner.profileId}/profile`)
      .expect(200);
    expect(profile.body.shortName).toBe('Kevin O.');
    // The runner on the current assignment sees the errand and its tracking.
    await http()
      .get(`/api/v1/errands/${errand.id}/tracking`)
      .set(bearer(runner.token))
      .expect(200);
    const other = await makeUser(UserRole.RUNNER);
    await http()
      .get(`/api/v1/errands/${errand.id}`)
      .set(bearer(other.token))
      .expect(403);
  });

  it('shows the customer refund status and the provider failure reason (rows 52, 54)', async () => {
    const customer = await makeUser(UserRole.CUSTOMER);
    const admin = await makeUser(UserRole.ADMIN);
    const errand = await createErrand(customer);
    await http()
      .post(`/api/v1/errands/${errand.id}/submit`)
      .set(bearer(customer.token))
      .expect(201);
    await http()
      .post(`/api/v1/errands/${errand.id}/quote`)
      .set(bearer(admin.token))
      .send({ total: 1000 })
      .expect(201);
    await setStatus(customer, errand.id, 'ACCEPTED');
    const none = await http()
      .get(`/api/v1/errands/${errand.id}/refund`)
      .set(bearer(customer.token))
      .expect(404);
    expect(none.body.code).toBe('refund_not_found');

    const first = await http()
      .post(`/api/v1/payments/${errand.id}/initiate`)
      .set(bearer(customer.token))
      .send({})
      .expect(201);
    await http()
      .post('/api/v1/payments/mpesa/callback')
      .send({
        reference: first.body.reference,
        resultCode: 1032,
        resultDesc: 'Request cancelled by user',
      })
      .expect(201);
    const failed = await http()
      .get(`/api/v1/payments/${errand.id}`)
      .set(bearer(customer.token))
      .expect(200);
    expect(failed.body.stkStatus).toBe('FAILED');
    expect(failed.body.failureReason).toBe('Request cancelled by user');

    const second = await http()
      .post(`/api/v1/payments/${errand.id}/initiate`)
      .set(bearer(customer.token))
      .send({})
      .expect(201);
    await http()
      .post('/api/v1/payments/mpesa/callback')
      .send({ reference: second.body.reference, resultCode: 0 })
      .expect(201);
    const paid = await http()
      .get(`/api/v1/payments/${errand.id}`)
      .set(bearer(customer.token))
      .expect(200);
    expect(paid.body.failureReason).toBeNull();
    // Paid and not cancelled: still no refund review.
    await http()
      .get(`/api/v1/errands/${errand.id}/refund`)
      .set(bearer(customer.token))
      .expect(404);
  });

  it('retries a FAILED price-difference charge (rows 44, 48)', async () => {
    const customer = await makeUser(UserRole.CUSTOMER);
    const admin = await makeUser(UserRole.ADMIN);
    const runner = await makeUser(UserRole.RUNNER);
    const errand = await createErrand(customer, buyForMe);
    await driveTo({ customer, admin, runner }, errand.id, 'IN_PROGRESS', {
      merchantRoute: 'send_to_runner',
    });
    const base = `/api/v1/errands/${errand.id}/price-change`;
    const req = await http()
      .post(base)
      .set(bearer(runner.token))
      .send({ toPrice: 650 })
      .expect(201);
    const approved = await http()
      .post(`${base}/${req.body.id}/approve`)
      .set(bearer(customer.token))
      .send({})
      .expect(201);
    const retryUrl = `/api/v1/payments/${errand.id}/price-changes/${req.body.id}/initiate`;
    const pending = await http()
      .post(retryUrl)
      .set(bearer(customer.token))
      .expect(201);
    expect(pending.body.payment.id).toBe(
      approved.body.differencePayment.payment.id,
    );
    await http()
      .post('/api/v1/payments/mpesa/callback')
      .send({
        reference:
          approved.body.differencePayment.transactions[0].mpesaReference,
        resultCode: 2001,
        resultDesc: 'Wrong PIN',
      })
      .expect(201);
    const retried = await http()
      .post(retryUrl)
      .set(bearer(customer.token))
      .expect(201);
    expect(retried.body.payment.id).not.toBe(
      approved.body.differencePayment.payment.id,
    );
    expect(retried.body.stkStatus).toBe('PENDING');
    const summary = await http()
      .get(`/api/v1/payments/${errand.id}`)
      .set(bearer(customer.token))
      .expect(200);
    expect(summary.body.differencePayments).toHaveLength(2);
    expect(summary.body.differencePayments[1].failureReason).toBe('Wrong PIN');
    await http().post(retryUrl).set(bearer(runner.token)).expect(403);
  });

  it('never exposes evidence storage keys or permanent URLs (row 25)', async () => {
    const customer = await makeUser(UserRole.CUSTOMER);
    const admin = await makeUser(UserRole.ADMIN);
    const errand = await createErrand(customer);
    // Issue #39: customers no longer upload; the admin path is unchanged.
    const up = await http()
      .post(`/api/v1/errands/${errand.id}/evidence`)
      .set(bearer(admin.token))
      .send({
        type: 'photo',
        contentType: 'image/png',
        data: Buffer.from('png-bytes').toString('base64'),
      })
      .expect(201);
    expect(up.body).not.toHaveProperty('s3Key');
    expect(up.body).toHaveProperty('urlExpiresAt');
    const list = await http()
      .get(`/api/v1/errands/${errand.id}/evidence`)
      .set(bearer(customer.token))
      .expect(200);
    expect(list.body[0]).not.toHaveProperty('s3Key');
  });
});
