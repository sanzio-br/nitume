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
import { UsersService } from '../src/users/users.service';

/**
 * Owner answers round 18 (rows 249 and 250, 2026-10-20):
 * - 249 (b): `outsideServiceArea` and the out-of-area notification only for
 *   REQUESTED, or QUOTED/ACCEPTED once the quote has expired.
 * - 250: tasks cancelled straight from DRAFT are not in the customer list.
 * Areas come from a config spy. No row goes into an append-only table
 * (row 198); every row is removed in afterAll by tracked id.
 */
describe('Owner answers round 18 (e2e)', () => {
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

  type Actor = { id: string; token: string };

  const makeUser = async (role: UserRole): Promise<Actor> => {
    const user = await app.get(UsersService).create({ phone: randomPhone(), role });
    userIds.push(user.id);
    if (role === UserRole.CUSTOMER) {
      await app.get(CustomersService).createForUser(user.id);
    }
    return { id: user.id, token: tokenFor(user) };
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
      // Explicit list: the tables this file writes with an errandId.
      for (const table of ['errand_status_history', 'errand_items', 'errand_locations', 'quotes', 'notification_log']) {
        await ds.query(`DELETE FROM "${table}" WHERE "errandId" = ANY($1)`, [errandIds]);
      }
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
      await ds.query('DELETE FROM "customer_profiles" WHERE "userId" = ANY($1)', [userIds]);
      await ds.query('DELETE FROM "users" WHERE "id" = ANY($1)', [userIds]);
    }
    await app.close();
  });

  const http = () => request(baseUrl);
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const db = () => app.get(DataSource);

  const NAIROBI = { lat: -1.2864, lng: 36.8172 };
  const MOMBASA = { lat: -4.04, lng: 39.7 };

  const createErrand = async (customer: Actor, point = MOMBASA) => {
    const res = await http()
      .post('/api/v1/errands')
      .set(bearer(customer.token))
      .send({
        category: 'buy_for_me',
        description: 'Buy a gas refill',
        budget: 500,
        locations: [{ pointType: 'dropoff', lat: point.lat, lon: point.lng, addressText: 'Test point' }],
      })
      .expect(201);
    errandIds.push(res.body.errand.id);
    return res.body.errand as { id: string };
  };

  let spy: { mockRestore: () => void } | null = null;
  afterEach(() => {
    spy?.mockRestore();
    spy = null;
  });

  const onlyArea = (id: string, point: { lat: number; lng: number }) => {
    spy?.mockRestore();
    const config = app.get(ConfigService);
    const original = config.get.bind(config);
    spy = vi
      .spyOn(config, 'get')
      .mockImplementation(((key: string, def?: unknown) =>
        key === 'runners.serviceAreas' ? [{ id, name: id.toUpperCase(), ...point, radiusKm: 1 }] : original(key, def)) as typeof config.get);
  };

  const outsideCount = async (userId: string, errandId: string): Promise<number> =>
    Number(
      (
        await db().query(
          `SELECT COUNT(*) AS n FROM "notifications" WHERE "userId" = $1 AND "eventType" = 'service_area.outside' AND "errandId" = $2`,
          [userId, errandId],
        )
      )[0].n,
    );

  describe('row 249 (b): outside-area state only once a quote would be refused', () => {
    it('ACCEPTED with a valid quote: flag false, re-quote 409 quote_still_valid, no notification; expired: flag true, 422 and notified', async () => {
      const customer = await makeUser(UserRole.CUSTOMER);
      const admin = await makeUser(UserRole.ADMIN);
      const task = await createErrand(customer);
      await http().post(`/api/v1/errands/${task.id}/submit`).set(bearer(customer.token)).expect(201);
      const quote = (status: number) =>
        http()
          .post(`/api/v1/errands/${task.id}/quote`)
          .set(bearer(admin.token))
          .send({ total: 1000, baseFee: 600, distanceFee: 400 })
          .expect(status);
      await quote(201);
      await http().post(`/api/v1/errands/${task.id}/quote/accept`).set(bearer(customer.token)).expect(200);
      const detail = async () => (await http().get(`/api/v1/errands/${task.id}`).set(bearer(customer.token)).expect(200)).body;

      // Areas shrink: the quote is still valid, so the customer can still pay.
      onlyArea('oa18-nbo', NAIROBI);
      expect(await detail()).toMatchObject({ status: 'ACCEPTED', outsideServiceArea: false });
      expect((await quote(409)).body.code).toBe('quote_still_valid');
      await new Promise((r) => setTimeout(r, 1_000));
      expect(await outsideCount(customer.id, task.id)).toBe(0);

      // The quote expires: now a re-quote would be refused.
      await db().query(`UPDATE "quotes" SET "expiresAt" = now() - interval '1 minute' WHERE "errandId" = $1`, [task.id]);
      expect(await detail()).toMatchObject({ status: 'ACCEPTED', outsideServiceArea: true });
      expect((await quote(422)).body.code).toBe('location_outside_service_area');
      let n = 0;
      for (let i = 0; i < 40 && n === 0; i += 1) {
        await new Promise((r) => setTimeout(r, 250));
        n = await outsideCount(customer.id, task.id);
      }
      expect(n).toBe(1);
    });
  });

  describe('row 250: DRAFT -> CANCELLED is not in the customer history', () => {
    it('hides a draft cancelled before submit from list and count; a submitted task cancelled stays', async () => {
      const customer = await makeUser(UserRole.CUSTOMER);
      const admin = await makeUser(UserRole.ADMIN);
      const discarded = await createErrand(customer);
      await http().patch(`/api/v1/errands/${discarded.id}/status`).set(bearer(customer.token)).send({ to: 'CANCELLED' }).expect(200);
      const submitted = await createErrand(customer);
      await http().post(`/api/v1/errands/${submitted.id}/submit`).set(bearer(customer.token)).expect(201);
      await http().patch(`/api/v1/errands/${submitted.id}/status`).set(bearer(customer.token)).send({ to: 'CANCELLED' }).expect(200);

      const list = await http().get('/api/v1/errands').set(bearer(customer.token)).expect(200);
      const ids = (list.body.items as { id: string }[]).map((e) => e.id);
      expect(ids).toContain(submitted.id);
      expect(ids).not.toContain(discarded.id);
      const cancelled = await http().get('/api/v1/errands?status=CANCELLED').set(bearer(customer.token)).expect(200);
      expect((cancelled.body.items as { id: string }[]).map((e) => e.id)).toEqual([submitted.id]);
      const count = await http().get('/api/v1/errands/count').set(bearer(customer.token)).expect(200);
      expect(count.body.count).toBe(1);

      // The task itself stays readable by id, and admins still list it.
      await http().get(`/api/v1/errands/${discarded.id}`).set(bearer(customer.token)).expect(200);
      const adminList = await http().get('/api/v1/errands?status=CANCELLED&limit=100').set(bearer(admin.token)).expect(200);
      expect((adminList.body.items as { id: string }[]).map((e) => e.id)).toContain(discarded.id);
    });
  });
});
