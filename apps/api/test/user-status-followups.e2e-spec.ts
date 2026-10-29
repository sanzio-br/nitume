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
import { RedisService } from '../src/infra/redis/redis.service';
import { userAccessCacheKey } from '../src/users/user-access.service';
import { UsersService } from '../src/users/users.service';
import { withAppendOnlyGuardLifted } from './support/test-database';

/**
 * Issue #24 follow-ups (owner, 2026-10-29): U-1 the admin account summary for
 * the Customer drawer. Every row is removed in afterAll by tracked id.
 */
describe('Admin user status follow-ups (issue #24, e2e)', () => {
  let app: INestApplication<App>;
  let baseUrl: string;
  let ds: DataSource;
  let redis: RedisService;
  const codes = new Map<string, string>();
  const userIds: string[] = [];
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

});
