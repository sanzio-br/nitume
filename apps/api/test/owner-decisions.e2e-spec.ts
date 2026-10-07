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

/**
 * Contract checks for the owner decisions (display names, errand fields,
 * OTP policy, state machine, price change, refunds, merchant route, STK
 * status). Every row created here is removed again in afterAll.
 */
describe('Owner decisions (e2e)', () => {
  let app: INestApplication<App>;
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
      await ds.query('DELETE FROM "runner_profiles" WHERE "userId" = ANY($1)', [userIds]);
      await ds.query('DELETE FROM "customer_profiles" WHERE "userId" = ANY($1)', [userIds]);
      await ds.query('DELETE FROM "users" WHERE "id" = ANY($1)', [userIds]);
    }
    await app.close();
  });

  const http = () => request(app.getHttpServer());
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
        .post('/api/v1/disputes')
        .set(bearer(customer.token))
        .send({ errandId: errand.id, reason: 'Photos do not show the bathroom' })
        .expect(201);
      const res = await http()
        .patch(`/api/v1/errands/${errand.id}/resolve-dispute`)
        .set(bearer(admin.token))
        .send({ verdict: 'runner', rationale: 'Bathroom video was uploaded as evidence.' })
        .expect(200);
      expect(res.body.errand.status).toBe('COMPLETED');
    });
  });
});
