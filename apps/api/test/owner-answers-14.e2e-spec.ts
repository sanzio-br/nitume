import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { UserRole } from '../src/common/enums';
import { CustomersService } from '../src/customers/customers.service';
import { RunnersService } from '../src/runners/runners.service';
import { UsersService } from '../src/users/users.service';
import { deleteRunnerVerifications, readyRunner } from './support/runner-fixtures';

/**
 * Owner answers round 14 (rows 233, 235, 2026-10-19): tasks inside no
 * configured service area are refused at create, submit and quote (233).
 * Areas come from a config spy (RUNNER_SERVICE_AREAS is empty in .env).
 * No row goes into an append-only table (row 198); every row is removed in
 * afterAll by tracked id.
 */
describe('Owner answers round 14 (e2e)', () => {
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

  const makeUser = async (role: UserRole, displayName?: string, opts: { ready?: boolean } = {}): Promise<Actor> => {
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
      if (opts.ready !== false) {
        // RA-8: verified and online, so assign and accept work.
        await readyRunner(app.get(DataSource), profileId);
      }
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
      // Explicit list (reviewer minor 7): the tables this file writes with an
      // errandId. It never writes evidence, disputes, chat, ratings, price
      // changes, runner locations or any append-only table.
      for (const table of [
        'errand_assignments',
        'errand_status_history',
        'errand_items',
        'errand_locations',
        'quotes',
        'notification_log',
      ]) {
        await ds.query(`DELETE FROM "${table}" WHERE "errandId" = ANY($1)`, [errandIds]);
      }
      // A queued feed job may still write a notification for these errands: clear and retry.
      for (let attempt = 0; ; attempt += 1) {
        await ds.query('DELETE FROM "notifications" WHERE "errandId" = ANY($1)', [errandIds]);
        try {
          await ds.query('DELETE FROM "errands" WHERE id = ANY($1)', [errandIds]);
          break;
        } catch (err) {
          if (attempt >= 5) {
            throw err;
          }
          await new Promise((r) => setTimeout(r, 300));
        }
      }
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

  let spy: { mockRestore: () => void } | null = null;
  afterEach(() => {
    spy?.mockRestore();
    spy = null;
  });

  /** One service area of radius 1 km around `point`, as the only configured area. */
  const onlyArea = (id: string, point: { lat: number; lng: number }) => {
    const config = app.get(ConfigService);
    const original = config.get.bind(config);
    spy = vi
      .spyOn(config, 'get')
      .mockImplementation(((key: string, def?: unknown) =>
        key === 'runners.serviceAreas' ? [{ id, name: id.toUpperCase(), ...point, radiusKm: 1 }] : original(key, def)) as typeof config.get);
  };

  const at = (point: { lat: number; lng: number }) => ({
    ...buyForMe,
    locations: [{ pointType: 'dropoff', lat: point.lat, lon: point.lng, addressText: 'Test point' }],
  });

  const NAIROBI = { lat: -1.2864, lng: 36.8172 };
  const MOMBASA = { lat: -4.04, lng: 39.7 };

  describe('row 233: service areas at create, submit and quote', () => {
    it('refuses a first point outside every area with 422 location_outside_service_area', async () => {
      onlyArea('oa14-nbo', NAIROBI);
      const customer = await makeUser(UserRole.CUSTOMER);
      const outside = await http()
        .post('/api/v1/errands')
        .set(bearer(customer.token))
        .send({ category: 'inspection', description: 'Check the flat', locations: [{ pointType: 'task_site', lat: MOMBASA.lat, lon: MOMBASA.lng, addressText: 'Nyali' }] })
        .expect(422);
      expect(outside.body).toMatchObject({ code: 'location_outside_service_area', pointType: 'task_site' });
      // Only the first point counts: pickup inside, drop-off outside is fine.
      const pickup = await http()
        .post('/api/v1/errands')
        .set(bearer(customer.token))
        .send({
          category: 'pickup_delivery',
          description: 'Bring the parcel',
          budget: 100,
          locations: [
            { pointType: 'dropoff', lat: MOMBASA.lat, lon: MOMBASA.lng, addressText: 'Nyali' },
            { pointType: 'pickup', lat: NAIROBI.lat, lon: NAIROBI.lng, addressText: 'CBD' },
          ],
        })
        .expect(201);
      errandIds.push(pickup.body.errand.id);
    });

    it('refuses submit and quote of tasks created before the areas were configured', async () => {
      const customer = await makeUser(UserRole.CUSTOMER);
      const admin = await makeUser(UserRole.ADMIN);
      // No areas configured: the check is off.
      const draft = await createErrand(customer, at(MOMBASA));
      const requested = await createErrand(customer, at(MOMBASA));
      await http().post(`/api/v1/errands/${requested.id}/submit`).set(bearer(customer.token)).expect(201);

      onlyArea('oa14-nbo2', NAIROBI);
      const submit = await http().post(`/api/v1/errands/${draft.id}/submit`).set(bearer(customer.token)).expect(422);
      expect(submit.body.code).toBe('location_outside_service_area');
      const quote = await http()
        .post(`/api/v1/errands/${requested.id}/quote`)
        .set(bearer(admin.token))
        .send({ total: 1000, baseFee: 600, distanceFee: 400 })
        .expect(422);
      expect(quote.body).toMatchObject({ code: 'location_outside_service_area', pointType: 'dropoff' });
      const statuses: { id: string; s: string }[] = await db().query(
        'SELECT id, status::text AS s FROM "errands" WHERE id = ANY($1)',
        [[draft.id, requested.id]],
      );
      expect(Object.fromEntries(statuses.map((r) => [r.id, r.s]))).toEqual({ [draft.id]: 'DRAFT', [requested.id]: 'REQUESTED' });
    });
  });
});
