import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

describe('API smoke (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  it('GET /api/v1/health returns ok (public)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
      });
  });

  it('protected routes reject an unauthenticated caller', async () => {
    await request(app.getHttpServer()).get('/api/v1/users/me').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/errands?limit=5')
      .expect(401);
  });

  it('rejects malformed OTP requests', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/otp/request')
      .send({ phone: '12345' })
      .expect(400);
  });

  afterEach(async () => {
    await app.close();
  });
});