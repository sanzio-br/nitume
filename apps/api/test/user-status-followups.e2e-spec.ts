import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { OTP_SENDER } from '../src/auth/otp-sender/otp-sender.provider';
import { UserRole } from '../src/common/enums';
import { CustomersService } from '../src/customers/customers.service';
import { RedisService } from '../src/infra/redis/redis.service';
import { userAccessCacheKey } from '../src/users/user-access.service';
import { UsersService } from '../src/users/users.service';
import { withAppendOnlyGuardLifted } from './support/test-database';

/**
 * Issue #24 follow-ups (owner, 2026-10-29): U-1 the admin account summary for
 * the Customer drawer; U-2 the admin errand detail's `customerUserId`. Every
 * row is removed in afterAll by tracked id.
 */
describe('Admin user status follow-ups (issue #24, e2e)', () => {
  let app: INestApplication<App>;
  let baseUrl: string;
  let ds: DataSource;
  let redis: RedisService;
  const codes = new Map<string, string>();
  const userIds: string[] = [];
  const errandIds: string[] = [];
  let admin: { id: string; token: string; phone: string };

  const randomPhone = (): string => `+2547${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;

  const tokenFor = (user: { id: string; role: UserRole; phone: string }): string =>
    new JwtService().sign(
      { sub: user.id, role: user.role, phone: user.phone, type: 'access' },
      { secret: app.get(ConfigService).get<string>('jwt.accessSecret') as string, expiresIn: '5m' },
    );

  const makeUser = async (role: UserRole = UserRole.CUSTOMER): Promise<{ id: string; token: string; phone: string }> => {
    const user = await app.get(UsersService).create({ phone: randomPhone(), role });
    userIds.push(user.id);
    return { id: user.id, token: tokenFor(user), phone: user.phone };
  };

  const summary = (token: string, userId: string) =>
    request(baseUrl).get(`/api/v1/admin/users/${userId}`).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OTP_SENDER)
      .useValue({
        name: 'capture',
        send: (phone: string, code: string) => {
          codes.set(phone, code);
          return Promise.resolve();
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    ds = app.get(DataSource);
    redis = app.get(RedisService);
    admin = await makeUser(UserRole.ADMIN);
  });

  afterAll(async () => {
    if (errandIds.length > 0) {
      for (const table of ['errand_assignments', 'errand_status_history', 'errand_items', 'errand_locations', 'quotes', 'notification_log', 'notifications']) {
        await ds.query(`DELETE FROM "${table}" WHERE "errandId" = ANY($1)`, [errandIds]);
      }
      await ds.query('DELETE FROM "errands" WHERE id = ANY($1)', [errandIds]);
    }
    if (userIds.length > 0) {
      await redis.del(...userIds.map(userAccessCacheKey));
      await withAppendOnlyGuardLifted(ds, 'user_status_history', async (query) => {
        await query('DELETE FROM "user_status_history" WHERE "userId" = ANY($1) OR "actorUserId" = ANY($1)', [userIds]);
      });
      const phones: { phone: string }[] = await ds.query('SELECT phone FROM "users" WHERE id = ANY($1)', [userIds]);
      await ds.query('DELETE FROM "otp_codes" WHERE target = ANY($1)', [phones.map((p) => p.phone)]);
      await ds.query('DELETE FROM "customer_profiles" WHERE "userId" = ANY($1)', [userIds]);
      await ds.query('DELETE FROM "runner_profiles" WHERE "userId" = ANY($1)', [userIds]);
      await ds.query('DELETE FROM "users" WHERE id = ANY($1)', [userIds]);
    }
    await app.close();
  });

  describe('U-1 GET /admin/users/:id', () => {
    it('an admin reads { id, role, status, displayName, phone } of any account', async () => {
      const target = await makeUser(UserRole.RUNNER);
      await ds.query(`UPDATE "users" SET "displayName" = 'Juma K.', status = 'suspended' WHERE id = $1`, [target.id]);
      const res = await summary(admin.token, target.id).expect(200);
      expect(res.body).toEqual({
        id: target.id,
        role: 'runner',
        status: 'suspended',
        displayName: 'Juma K.',
        phone: target.phone,
      });
    });

    it('displayName is null until set', async () => {
      const target = await makeUser();
      const res = await summary(admin.token, target.id).expect(200);
      expect(res.body.displayName).toBeNull();
      expect(res.body.status).toBe('active');
    });

    it.each([UserRole.CUSTOMER, UserRole.RUNNER, UserRole.BUSINESS])('a %s gets 403', async (role) => {
      const caller = await makeUser(role);
      await summary(caller.token, caller.id).expect(403);
    });

    it('no token is 401', async () => {
      await request(baseUrl).get(`/api/v1/admin/users/${admin.id}`).expect(401);
    });

    it('404 user_not_found for an unknown id', async () => {
      const res = await summary(admin.token, '00000000-0000-4000-8000-000000000000').expect(404);
      expect(res.body.code).toBe('user_not_found');
    });

    it('400 for an id that is not a UUID', async () => {
      await summary(admin.token, 'not-a-uuid').expect(400);
    });
  });

  describe('U-2 customerUserId on the admin errand detail', () => {
    const createErrand = async (token: string): Promise<{ id: string; customerId: string }> => {
      const res = await request(baseUrl)
        .post('/api/v1/errands')
        .set('Authorization', `Bearer ${token}`)
        .send({
          category: 'inspection',
          description: 'Check the apartment in Nyali',
          budget: 0,
          locations: [{ pointType: 'task_site', lat: -4.04, lon: 39.7, addressText: 'Links Road, Nyali' }],
        })
        .expect(201);
      errandIds.push(res.body.errand.id as string);
      return res.body.errand as { id: string; customerId: string };
    };

    const makeCustomer = async () => {
      const customer = await makeUser(UserRole.CUSTOMER);
      const profileId = (await app.get(CustomersService).createForUser(customer.id)).id;
      return { ...customer, profileId };
    };

    it("the admin detail carries the owning customer's user id, next to the profile id", async () => {
      const owner = await makeCustomer();
      await makeCustomer(); // another customer, so the id is not just any customer
      const errand = await createErrand(owner.token);
      const res = await request(baseUrl).get(`/api/v1/errands/${errand.id}`).set('Authorization', `Bearer ${admin.token}`).expect(200);
      expect(res.body.customerId).toBe(owner.profileId);
      expect(res.body.customerUserId).toBe(owner.id);
      // ...and it opens the Customer drawer (U-1).
      const summary = await request(baseUrl)
        .get(`/api/v1/admin/users/${res.body.customerUserId as string}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);
      expect(summary.body).toMatchObject({ id: owner.id, role: 'customer', phone: owner.phone });
    });

    it("the customer's own detail does not carry it (admin only, additive)", async () => {
      const owner = await makeCustomer();
      const errand = await createErrand(owner.token);
      const res = await request(baseUrl).get(`/api/v1/errands/${errand.id}`).set('Authorization', `Bearer ${owner.token}`).expect(200);
      expect(res.body).not.toHaveProperty('customerUserId');
    });
  });
});
