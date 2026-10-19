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
 * Contract checks for the owner decisions (display names, errand fields,
 * OTP policy, state machine, price change, refunds, merchant route, STK
 * status). Every row created here is removed again in afterAll.
 */
describe('Owner decisions (e2e)', () => {
  let app: INestApplication<App>;
  let baseUrl: string;
  const userIds: string[] = [];
  const errandIds: string[] = [];
  const otpPhones: string[] = [];

  const randomPhone = (): string =>
    `+2547${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;

  const tokenFor = (user: { id: string; role: UserRole; phone: string }): string =>
    new JwtService().sign(
      { sub: user.id, role: user.role, phone: user.phone, type: 'access' },
      {
        secret: app.get(ConfigService).get<string>('jwt.accessSecret') as string,
        expiresIn: '5m',
      },
    );

  const makeUser = async (
    role: UserRole,
  ): Promise<{ id: string; token: string; profileId: string | null }> => {
    const user = await app.get(UsersService).create({ phone: randomPhone(), role });
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
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
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
      await ds.query('DELETE FROM "payments" WHERE "errandId" = ANY($1)', [errandIds]);
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
    if (otpPhones.length > 0) {
      await ds.query('DELETE FROM "otp_codes" WHERE target = ANY($1)', [otpPhones]);
    }
    if (userIds.length > 0) {
      await ds.query('DELETE FROM "notifications" WHERE "userId" = ANY($1)', [userIds]);
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
          { pointType: 'task_site', lat: -4.04, lon: 39.7, addressText: 'Links Road, Nyali' },
        ],
        ...body,
      })
      .expect(201);
    errandIds.push(res.body.errand.id);
    return res.body.errand;
  };

  const setStatus = async (actor: Actor, errandId: string, to: string, expected = 200) =>
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
    await http().post(`/api/v1/errands/${errandId}/submit`).set(bearer(customer.token)).expect(201);
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

  describe('display name', () => {
    it('is null until set, then settable via PATCH /users/me', async () => {
      const customer = await makeUser(UserRole.CUSTOMER);
      const before = await http().get('/api/v1/users/me').set(bearer(customer.token)).expect(200);
      expect(before.body.displayName).toBeNull();

      const after = await http()
        .patch('/api/v1/users/me')
        .set(bearer(customer.token))
        .send({ displayName: '  Amina Wanjiru ' })
        .expect(200);
      expect(after.body.displayName).toBe('Amina Wanjiru');

      await http()
        .patch('/api/v1/users/me')
        .set(bearer(customer.token))
        .send({ displayName: 'x' })
        .expect(400);
    });

    it('appears on the public runner profile', async () => {
      const runner = await makeUser(UserRole.RUNNER);
      await http()
        .patch('/api/v1/users/me')
        .set(bearer(runner.token))
        .send({ displayName: 'Brian O.' })
        .expect(200);
      const res = await http().get(`/api/v1/runners/${runner.profileId}/profile`).expect(200);
      expect(res.body.displayName).toBe('Brian O.');
      expect(res.body).not.toHaveProperty('phone');
    });
  });

  describe('errand fields', () => {
    it('generates a reference, keeps title, structured items and both points', async () => {
      const customer = await makeUser(UserRole.CUSTOMER);
      const errand = await createErrand(customer, {
        category: 'pickup_delivery',
        title: '  Collect parcel  ',
        urgency: 'scheduled',
        deadlineAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        items: [{ name: 'Parcel', quantity: 1, notes: 'Fragile' }],
        locations: [
          { pointType: 'pickup', lat: -4.05, lon: 39.66, addressText: 'Mombasa CBD' },
          { pointType: 'dropoff', lat: -4.04, lon: 39.7, addressText: 'Links Road, Nyali' },
        ],
      });
      expect(errand.reference).toMatch(/^NT-\d{5,}$/);
      expect(errand.title).toBe('Collect parcel');
      expect(errand.urgency).toBe('urgent');
      expect(errand.runnerNotes).toBeNull();

      const second = await createErrand(customer);
      expect(second.reference).not.toBe(errand.reference);

      const detail = await http()
        .get(`/api/v1/errands/${errand.id}`)
        .set(bearer(customer.token))
        .expect(200);
      expect(detail.body.items).toEqual([
        { id: expect.any(String), name: 'Parcel', quantity: 1, unit: null, notes: 'Fragile' },
      ]);
      expect(detail.body.locations).toHaveLength(2);
      expect(detail.body.locations).toContainEqual({
        id: expect.any(String),
        pointType: 'pickup',
        lat: -4.05,
        lng: 39.66,
        addressText: 'Mombasa CBD',
        placeId: null,
      });
    });

    it('rejects a past deadline and Get It For Me without both points', async () => {
      const customer = await makeUser(UserRole.CUSTOMER);
      const base = {
        category: 'inspection',
        description: 'Check the apartment in Nyali',
        budget: 0,
        locations: [
          { pointType: 'task_site', lat: -4.04, lon: 39.7, addressText: 'Links Road, Nyali' },
        ],
      };
      const past = await http()
        .post('/api/v1/errands')
        .set(bearer(customer.token))
        .send({ ...base, deadlineAt: '2020-01-01T00:00:00.000Z' })
        .expect(400);
      expect(past.body.code).toBe('deadline_in_past');
      const missing = await http()
        .post('/api/v1/errands')
        .set(bearer(customer.token))
        .send({ ...base, category: 'pickup_delivery' })
        .expect(400);
      expect(missing.body.code).toBe('locations_pickup_dropoff_required');
    });

    it('lets the owner edit the title and the assigned runner write notes', async () => {
      const customer = await makeUser(UserRole.CUSTOMER);
      const admin = await makeUser(UserRole.ADMIN);
      const runner = await makeUser(UserRole.RUNNER);
      const other = await makeUser(UserRole.RUNNER);
      const errand = await createErrand(customer);

      const edited = await http()
        .patch(`/api/v1/errands/${errand.id}`)
        .set(bearer(customer.token))
        .send({ title: 'Apartment check' })
        .expect(200);
      expect(edited.body.title).toBe('Apartment check');
      await http()
        .patch(`/api/v1/errands/${errand.id}`)
        .set(bearer(customer.token))
        .send({ reference: 'NT-1' })
        .expect(400);

      await driveTo({ customer, admin, runner }, errand.id, 'RUNNER_ASSIGNED');
      const early = await http()
        .patch(`/api/v1/errands/${errand.id}/runner-notes`)
        .set(bearer(runner.token))
        .send({ runnerNotes: 'Too early' })
        .expect(409);
      expect(early.body.code).toBe('runner_notes_not_allowed');

      for (const to of ['RUNNER_EN_ROUTE', 'ARRIVED', 'IN_PROGRESS']) {
        await setStatus(runner, errand.id, to);
      }
      await http()
        .patch(`/api/v1/errands/${errand.id}/runner-notes`)
        .set(bearer(other.token))
        .send({ runnerNotes: 'Not mine' })
        .expect(403);
      await http()
        .patch(`/api/v1/errands/${errand.id}/runner-notes`)
        .set(bearer(runner.token))
        .send({ runnerNotes: 'Leak reported to the landlord.' })
        .expect(200);
      const detail = await http()
        .get(`/api/v1/errands/${errand.id}`)
        .set(bearer(customer.token))
        .expect(200);
      expect(detail.body.runnerNotes).toBe('Leak reported to the landlord.');
      expect(detail.body.assignment.runner).toHaveProperty('displayName');
    });
  });

  describe('OTP policy', () => {
    it('returns machine-readable codes for cooldown and wrong codes', async () => {
      const phone = randomPhone();
      otpPhones.push(phone);
      await http().post('/api/v1/auth/otp/verify').send({ phone, code: '123456' }).expect(401)
        .then((res) => expect(res.body.code).toBe('otp_not_requested'));
      await http().post('/api/v1/auth/otp/request').send({ phone }).expect(201);
      const again = await http().post('/api/v1/auth/otp/request').send({ phone }).expect(429);
      expect(again.body.code).toBe('otp_resend_cooldown');
      expect(again.body.secondsRemaining).toBeGreaterThan(0);
      expect(again.body.secondsRemaining).toBeLessThanOrEqual(60);
      expect(again.body.retryAfterSeconds).toBe(again.body.secondsRemaining);

      const ds = app.get(DataSource);
      const [row] = await ds.query(
        `SELECT EXTRACT(EPOCH FROM ("expiresAt" - "createdAt"))::float AS ttl
           FROM "otp_codes" WHERE target = $1`,
        [phone],
      );
      expect(Math.round(row.ttl)).toBe(300);

      // Pick a code that cannot be the issued one by flipping a stored hash check:
      // two different wrong guesses can't both be right.
      const first = await http().post('/api/v1/auth/otp/verify').send({ phone, code: '000000' });
      const second = await http().post('/api/v1/auth/otp/verify').send({ phone, code: '999999' });
      const wrong = [first, second].find((r) => r.status === 401);
      expect(wrong?.body.code).toBe('otp_incorrect');
      expect(typeof wrong?.body.attemptsRemaining).toBe('number');
    });
  });

  describe('state machine', () => {
    it('confirm = AWAITING_CUSTOMER -> COMPLETED; CONFIRMED is not a customer step', async () => {
      const customer = await makeUser(UserRole.CUSTOMER);
      const admin = await makeUser(UserRole.ADMIN);
      const runner = await makeUser(UserRole.RUNNER);
      const errand = await createErrand(customer);
      await driveTo({ customer, admin, runner }, errand.id, 'AWAITING_CUSTOMER');
      await setStatus(customer, errand.id, 'COMPLETED');
      await setStatus(customer, errand.id, 'CONFIRMED', 403);
      await setStatus(admin, errand.id, 'CONFIRMED', 403);
    });

    it('IN_PROGRESS -> CANCELLED is refused outside the price-change rejection', async () => {
      const customer = await makeUser(UserRole.CUSTOMER);
      const admin = await makeUser(UserRole.ADMIN);
      const runner = await makeUser(UserRole.RUNNER);
      const errand = await createErrand(customer);
      await driveTo({ customer, admin, runner }, errand.id, 'IN_PROGRESS');
      const res = await setStatus(customer, errand.id, 'CANCELLED', 409);
      expect(res.body.code).toBe('transition_requires_price_change_rejection');
    });

    it('resolve-dispute runner verdict returns the task to COMPLETED', async () => {
      const customer = await makeUser(UserRole.CUSTOMER);
      const admin = await makeUser(UserRole.ADMIN);
      const runner = await makeUser(UserRole.RUNNER);
      const errand = await createErrand(customer);
      await driveTo({ customer, admin, runner }, errand.id, 'AWAITING_CUSTOMER');
      await http()
        .get(`/api/v1/errands/${errand.id}/dispute`)
        .set(bearer(customer.token))
        .expect(404);
      const opened = await http()
        .post('/api/v1/disputes')
        .set(bearer(customer.token))
        .send({ errandId: errand.id, reason: 'Photos do not show the bathroom' })
        .expect(201);
      const found = await http()
        .get(`/api/v1/errands/${errand.id}/dispute`)
        .set(bearer(customer.token))
        .expect(200);
      expect(found.body.id).toBe(opened.body.id);
      expect(found.body.events[0].eventType).toBe('opened');
      const res = await http()
        .patch(`/api/v1/errands/${errand.id}/resolve-dispute`)
        .set(bearer(admin.token))
        .send({ verdict: 'runner', rationale: 'Bathroom video was uploaded as evidence.' })
        .expect(200);
      expect(res.body.errand.status).toBe('COMPLETED');
    });
  });

  describe('payments', () => {
    const prepare = async (budget: number): Promise<{ customer: Actor; admin: Actor; errand: Record<string, any> }> => {
      const customer = await makeUser(UserRole.CUSTOMER);
      const admin = await makeUser(UserRole.ADMIN);
      // A budget only applies to Buy For Me / Get It For Me (row 45).
      const errand = await createErrand(
        customer,
        budget > 0
          ? {
              category: 'buy_for_me',
              budget,
              locations: [
                { pointType: 'dropoff', lat: -4.04, lon: 39.7, addressText: 'Links Road, Nyali' },
              ],
            }
          : { budget },
      );
      await http().post(`/api/v1/errands/${errand.id}/submit`).set(bearer(customer.token)).expect(201);
      await http()
        .post(`/api/v1/errands/${errand.id}/quote`)
        .set(bearer(admin.token))
        .send({ total: 1000 })
        .expect(201);
      await setStatus(customer, errand.id, 'ACCEPTED');
      return { customer, admin, errand };
    };

    it('retries with the same Idempotency-Key return the stored payment', async () => {
      const { customer, errand } = await prepare(0);
      const key = `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const first = await http()
        .post(`/api/v1/payments/${errand.id}/initiate`)
        .set(bearer(customer.token))
        .set('Idempotency-Key', key)
        .send({})
        .expect(201);
      expect(first.body.stkStatus).toBe('PENDING');
      expect(first.body.payment.idempotencyKey).toBe(key);
      expect(first.body.merchantPayment).toBeNull();
      const retry = await http()
        .post(`/api/v1/payments/${errand.id}/initiate`)
        .set(bearer(customer.token))
        .set('Idempotency-Key', key)
        .send({})
        .expect(201);
      expect(retry.body.payment.id).toBe(first.body.payment.id);
      expect(retry.body.reference).toBe(first.body.reference);

      const bad = await http()
        .post(`/api/v1/payments/${errand.id}/initiate`)
        .set(bearer(customer.token))
        .set('Idempotency-Key', 'x')
        .send({})
        .expect(400);
      expect(bad.body.code).toBe('idempotency_key_invalid');

      await http()
        .post('/api/v1/payments/mpesa/callback')
        .send({ reference: first.body.reference, resultCode: 0 })
        .expect(201);
      const read = await http()
        .get(`/api/v1/payments/${errand.id}`)
        .set(bearer(customer.token))
        .expect(200);
      expect(read.body.stkStatus).toBe('SUCCESS');
    });

    it('requires a merchant route and refuses merchant_direct without details', async () => {
      const { customer, errand } = await prepare(2500);
      const missing = await http()
        .post(`/api/v1/payments/${errand.id}/initiate`)
        .set(bearer(customer.token))
        .send({})
        .expect(400);
      expect(missing.body.code).toBe('merchant_route_required');
      const direct = await http()
        .post(`/api/v1/payments/${errand.id}/initiate`)
        .set(bearer(customer.token))
        .send({ merchantRoute: 'merchant_direct' })
        .expect(409);
      expect(direct.body.code).toBe('merchant_details_missing');
      await http()
        .post(`/api/v1/payments/${errand.id}/initiate`)
        .set(bearer(customer.token))
        .send({ merchantRoute: 'runner_advance' })
        .expect(400);
      const ok = await http()
        .post(`/api/v1/payments/${errand.id}/initiate`)
        .set(bearer(customer.token))
        .send({ merchantRoute: 'send_to_runner' })
        .expect(201);
      expect(ok.body.payment.paymentFlow).toBe('customer_to_runner');
      expect(ok.body.merchantPayment).toEqual({
        route: 'send_to_runner',
        amount: '2500.00',
        paidTo: 'nitume',
      });
      // Platform-mediated (row 42): the purchase amount is a leg of the STK charge.
      expect(ok.body.transactions.map((t: { amount: string }) => t.amount).sort()).toEqual([
        '200.00',
        '2500.00',
        '300.00',
      ]);
    });

    it('pays merchant_direct once an admin sets the Till details (row 43)', async () => {
      const { customer, admin, errand } = await prepare(2500);
      await http()
        .put(`/api/v1/errands/${errand.id}/merchant-details`)
        .set(bearer(customer.token))
        .send({ merchantName: 'Naivas Nyali', tillNumber: '123456' })
        .expect(403);
      const bad = await http()
        .put(`/api/v1/errands/${errand.id}/merchant-details`)
        .set(bearer(admin.token))
        .send({ merchantName: 'Naivas Nyali', tillNumber: '123456', paybillNumber: '400200' })
        .expect(400);
      expect(bad.body.code).toBe('merchant_details_invalid');
      await http()
        .put(`/api/v1/errands/${errand.id}/merchant-details`)
        .set(bearer(admin.token))
        .send({ merchantName: 'Naivas Nyali', tillNumber: '123456' })
        .expect(200);
      const ok = await http()
        .post(`/api/v1/payments/${errand.id}/initiate`)
        .set(bearer(customer.token))
        .send({ merchantRoute: 'merchant_direct' })
        .expect(201);
      expect(ok.body.merchantDetailsAvailable).toBe(true);
      expect(ok.body.merchantPayment).toEqual({
        route: 'merchant_direct',
        amount: '2500.00',
        paidTo: 'merchant',
        merchantName: 'Naivas Nyali',
        tillNumber: '123456',
        paybillNumber: null,
        accountReference: null,
        merchantDetailsUpdatedAt: null,
        merchantDetailsChangedAfterPayment: false,
      });
      expect(ok.body.transactions).toHaveLength(2);
    });
  });

  describe('payment methods', () => {
    it('accepts only M-Pesa methods', async () => {
      const customer = await makeUser(UserRole.CUSTOMER);
      const body = { label: 'Visa', detail: '•••• 4242' };
      await http()
        .post('/api/v1/customers/me/payment-methods')
        .set(bearer(customer.token))
        .send({ ...body, type: 'card' })
        .expect(400);
      await http()
        .post('/api/v1/customers/me/payment-methods')
        .set(bearer(customer.token))
        .send({ label: 'M-Pesa', detail: '+2547•• •••••887', type: 'mpesa', phoneNumber: '+254712345887' })
        .expect(201);
    });
  });

  describe('price change and refunds', () => {
    it('approve records the difference; reject cancels and opens a refund review', async () => {
      const customer = await makeUser(UserRole.CUSTOMER);
      const admin = await makeUser(UserRole.ADMIN);
      const runner = await makeUser(UserRole.RUNNER);
      const errand = await createErrand(customer, {
        category: 'buy_for_me',
        budget: 500,
        locations: [
          { pointType: 'dropoff', lat: -4.04, lon: 39.7, addressText: 'Links Road, Nyali' },
        ],
      });
      await driveTo({ customer, admin, runner }, errand.id, 'IN_PROGRESS', {
        merchantRoute: 'send_to_runner',
      });
      const base = `/api/v1/errands/${errand.id}/price-change`;

      const up = await http().post(base).set(bearer(runner.token)).send({ toPrice: 650 }).expect(201);
      expect(up.body.fromPrice).toBe('500.00');
      const approved = await http()
        .post(`${base}/${up.body.id}/approve`)
        .set(bearer(customer.token))
        .send({})
        .expect(201);
      expect(approved.body.status).toBe('approved');
      expect(approved.body.differencePayment.merchantPayment).toEqual({
        route: 'send_to_runner',
        amount: '150.00',
        paidTo: 'nitume',
      });
      expect(approved.body.differencePayment.payment.priceChangeRequestId).toBe(up.body.id);
      // The increase is charged by STK to Nitume (rows 44, 48).
      expect(approved.body.differencePayment.stkStatus).toBe('PENDING');
      expect(typeof approved.body.differencePayment.checkoutRequestId).toBe('string');
      await http()
        .post('/api/v1/payments/mpesa/callback')
        .send({
          reference: approved.body.differencePayment.transactions[0].mpesaReference,
          resultCode: 0,
        })
        .expect(201);
      const summary = await http()
        .get(`/api/v1/payments/${errand.id}`)
        .set(bearer(customer.token))
        .expect(200);
      expect(summary.body.differencePayments[0].stkStatus).toBe('SUCCESS');
      const afterApprove = await http()
        .get(`/api/v1/errands/${errand.id}`)
        .set(bearer(customer.token))
        .expect(200);
      expect(afterApprove.body.budget).toBe('650.00');
      expect(afterApprove.body.quotedPrice).toBe('1000.00');

      const second = await http().post(base).set(bearer(runner.token)).send({ toPrice: 900 }).expect(201);
      expect(second.body.fromPrice).toBe('650.00');
      const rejected = await http()
        .post(`${base}/${second.body.id}/reject`)
        .set(bearer(customer.token))
        .send({})
        .expect(201);
      expect(rejected.body.status).toBe('rejected');
      const cancelled = await http()
        .get(`/api/v1/errands/${errand.id}`)
        .set(bearer(customer.token))
        .expect(200);
      expect(cancelled.body.status).toBe('CANCELLED');

      // The refund review is opened from the status event (async).
      let review: Record<string, any> | undefined;
      for (let i = 0; i < 20 && !review; i++) {
        const list = await http()
          .get('/api/v1/refunds?status=pending_review&limit=100')
          .set(bearer(admin.token))
          .expect(200);
        review = list.body.items.find((r: { errandId: string }) => r.errandId === errand.id);
        if (!review) await new Promise((r) => setTimeout(r, 50));
      }
      // Service 200 + runner 300 + purchase 500 + paid difference 150.
      expect(review).toMatchObject({
        trigger: 'price_change_rejected',
        amountPaid: '1150.00',
        status: 'pending_review',
      });
      await http().get('/api/v1/refunds').set(bearer(customer.token)).expect(403);

      const tooMuch = await http()
        .patch(`/api/v1/refunds/${review!.id}/decision`)
        .set(bearer(admin.token))
        .send({ refundAmount: 1151 })
        .expect(400);
      expect(tooMuch.body.code).toBe('refund_exceeds_amount_paid');
      const decided = await http()
        .patch(`/api/v1/refunds/${review!.id}/decision`)
        .set(bearer(admin.token))
        .send({ refundAmount: 300, note: 'Runner fee kept for time spent' })
        .expect(200);
      expect(decided.body).toMatchObject({ status: 'approved', refundAmount: '300.00' });
      const paid = await http()
        .post(`/api/v1/refunds/${review!.id}/mark-paid`)
        .set(bearer(admin.token))
        .send({ payoutReference: 'QJK12AB34C' })
        .expect(200);
      expect(paid.body.status).toBe('refunded');
    });

    it('refuses reject-and-cancel while the runner is en route', async () => {
      const customer = await makeUser(UserRole.CUSTOMER);
      const admin = await makeUser(UserRole.ADMIN);
      const runner = await makeUser(UserRole.RUNNER);
      // Price changes move the item amount: Buy For Me / Get It For Me only (row 80).
      const errand = await createErrand(customer, {
        category: 'buy_for_me',
        budget: 50,
        locations: [{ pointType: 'dropoff', lat: -4.04, lon: 39.7, addressText: 'Links Road, Nyali' }],
      });
      await driveTo({ customer, admin, runner }, errand.id, 'RUNNER_ASSIGNED', {
        merchantRoute: 'send_to_runner',
      });
      await setStatus(runner, errand.id, 'RUNNER_EN_ROUTE');
      const base = `/api/v1/errands/${errand.id}/price-change`;
      // Runners request price changes only IN_PROGRESS (row 49); an admin still can.
      const early = await http().post(base).set(bearer(runner.token)).send({ toPrice: 100 }).expect(409);
      expect(early.body.code).toBe('price_change_not_in_progress');
      const req = await http().post(base).set(bearer(admin.token)).send({ toPrice: 100 }).expect(201);
      const res = await http()
        .post(`${base}/${req.body.id}/reject`)
        .set(bearer(customer.token))
        .send({})
        .expect(409);
      expect(res.body.code).toBe('price_change_reject_not_cancellable');
    });
  });
});
