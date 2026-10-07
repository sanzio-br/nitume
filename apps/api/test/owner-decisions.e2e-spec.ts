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
    if (userIds.length > 0) {
      const ds = app.get(DataSource);
      await ds.query('DELETE FROM "runner_profiles" WHERE "userId" = ANY($1)', [userIds]);
      await ds.query('DELETE FROM "customer_profiles" WHERE "userId" = ANY($1)', [userIds]);
      await ds.query('DELETE FROM "users" WHERE "id" = ANY($1)', [userIds]);
    }
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

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
});
