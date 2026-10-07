import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { UserRole } from '../src/common/enums';
import { CustomersService } from '../src/customers/customers.service';
import { UsersService } from '../src/users/users.service';

/**
 * Contract checks for the customer-app gap endpoints (A-3..A-13). Uses a
 * throwaway customer that is removed again in afterAll.
 */
describe('Customer gap endpoints (e2e)', () => {
  let app: INestApplication<App>;
  let token: string;
  let userId: string;
  const unknownId = randomUUID();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    const phone = `+2547${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
    const user = await app.get(UsersService).create({ phone, role: UserRole.CUSTOMER });
    userId = user.id;
    await app.get(CustomersService).createForUser(user.id);
    token = new JwtService().sign(
      { sub: user.id, role: user.role, phone: user.phone, type: 'access' },
      { secret: app.get(ConfigService).get<string>('jwt.accessSecret') as string, expiresIn: '5m' },
    );
  });

  afterAll(async () => {
    if (userId) {
      const ds = app.get(DataSource);
      await ds.query('DELETE FROM "devices" WHERE "userId" = $1', [userId]);
      await ds.query('DELETE FROM "customer_profiles" WHERE "userId" = $1', [userId]);
      await ds.query('DELETE FROM "users" WHERE "id" = $1', [userId]);
    }
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const http = () => request(app.getHttpServer());

  it('requires auth on every new route', async () => {
    await http().get('/api/v1/errands/count').expect(401);
    await http().get(`/api/v1/errands/${unknownId}/quote`).expect(401);
    await http().get(`/api/v1/errands/${unknownId}/tracking`).expect(401);
    await http().get(`/api/v1/errands/${unknownId}/price-change`).expect(401);
    await http().post('/api/v1/users/me/devices').expect(401);
    await http().post('/api/v1/disputes').expect(401);
    await http().get(`/api/v1/disputes/${unknownId}`).expect(401);
  });

  it('GET /errands/count returns { count } (A-11)', async () => {
    const res = await http().get('/api/v1/errands/count').set(auth()).expect(200);
    expect(res.body).toEqual({ count: 0 });
    await http()
      .get('/api/v1/errands/count?status=SETTLED,CANCELLED')
      .set(auth())
      .expect(200);
  });

  it('GET /errands accepts several statuses and rejects unknown ones (A-10)', async () => {
    const res = await http()
      .get('/api/v1/errands?status=RUNNER_EN_ROUTE,ARRIVED&status=IN_PROGRESS')
      .set(auth())
      .expect(200);
    expect(res.body).toEqual({ items: [], nextCursor: null });
    await http().get('/api/v1/errands?status=NOPE').set(auth()).expect(400);
  });

  it('errand sub-resources 404 for an unknown errand (A-3, A-5, A-8)', async () => {
    await http().get(`/api/v1/errands/${unknownId}/quote`).set(auth()).expect(404);
    await http().get(`/api/v1/errands/${unknownId}/tracking`).set(auth()).expect(404);
    await http()
      .get(`/api/v1/errands/${unknownId}/price-change?status=requested`)
      .set(auth())
      .expect(404);
    await http()
      .get(`/api/v1/errands/${unknownId}/price-change?status=bogus`)
      .set(auth())
      .expect(400);
  });

  it('registers, refreshes and removes a push device (A-13)', async () => {
    const body = { platform: 'android', pushToken: `e2e-${randomUUID()}` };
    const first = await http().post('/api/v1/users/me/devices').set(auth()).send(body).expect(200);
    expect(first.body).toMatchObject({ userId, platform: 'android', pushToken: body.pushToken });
    const again = await http().post('/api/v1/users/me/devices').set(auth()).send(body).expect(200);
    expect(again.body.id).toBe(first.body.id);
    await http()
      .post('/api/v1/users/me/devices')
      .set(auth())
      .send({ platform: 'blackberry', pushToken: 'x' })
      .expect(400);
    await http().delete(`/api/v1/users/me/devices/${first.body.id}`).set(auth()).expect(204);
    await http().delete(`/api/v1/users/me/devices/${first.body.id}`).set(auth()).expect(404);
  });

  it('validates and scopes disputes (A-9)', async () => {
    await http()
      .post('/api/v1/disputes')
      .set(auth())
      .send({ errandId: 'not-a-uuid', reason: 'x' })
      .expect(400);
    await http()
      .post('/api/v1/disputes')
      .set(auth())
      .send({ errandId: unknownId, reason: 'Runner never arrived' })
      .expect(404);
    await http().get(`/api/v1/disputes/${unknownId}`).set(auth()).expect(404);
  });
});
