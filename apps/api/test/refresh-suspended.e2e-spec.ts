import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Read by the config factory when the module compiles (before the imports below run it).
const ORIGINAL_WEB_ORIGINS = vi.hoisted(() => {
  const original = process.env.WEB_ORIGINS;
  process.env.WEB_ORIGINS = 'https://web.nitume.test';
  return original;
});

import { AppModule } from '../src/app.module';
import { OTP_SENDER } from '../src/auth/otp-sender/otp-sender.provider';
import { REFRESH_COOKIE_NAME } from '../src/auth/web/refresh-cookie.service';
import { corsOptionsDelegate } from '../src/common/cors';

/**
 * Issue #21 (owner, 2026-10-28): `/auth/refresh` (mobile) and
 * `/auth/web/refresh` (website) refuse a suspended account with the same
 * 401 `account_suspended` OTP verify uses, revoke the session and, on web,
 * clear the cookie. Reactivation does not revive the revoked session.
 */
describe('Refresh rejects suspended accounts (issue #21, e2e)', () => {
  const WEB_ORIGIN = 'https://web.nitume.test';
  let app: INestApplication<App>;
  let baseUrl: string;
  let ds: DataSource;
  const codes = new Map<string, string>();
  const phones: string[] = [];

  const randomPhone = (): string => {
    const phone = `+2547${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
    phones.push(phone);
    return phone;
  };

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
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    const config = app.get(ConfigService);
    app.enableCors(corsOptionsDelegate(config.get<string[]>('web.origins', [])));
    await app.init();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    ds = app.get(DataSource);
  });

  afterAll(async () => {
    if (phones.length > 0) {
      await ds.query('DELETE FROM "otp_codes" WHERE target = ANY($1)', [phones]);
      const users: { id: string }[] = await ds.query('SELECT id FROM "users" WHERE phone = ANY($1)', [phones]);
      const ids = users.map((u) => u.id);
      if (ids.length > 0) {
        await ds.query('DELETE FROM "customer_profiles" WHERE "userId" = ANY($1)', [ids]);
        await ds.query('DELETE FROM "users" WHERE id = ANY($1)', [ids]);
      }
    }
    await app.close();
    if (ORIGINAL_WEB_ORIGINS === undefined) {
      delete process.env.WEB_ORIGINS;
    } else {
      process.env.WEB_ORIGINS = ORIGINAL_WEB_ORIGINS;
    }
  });

  const http = () => request(baseUrl);
  const web = { Origin: WEB_ORIGIN };

  const refreshCookie = (res: request.Response): string | undefined => {
    const raw = res.headers['set-cookie'] as string[] | string | undefined;
    const all = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
    return all.find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
  };
  const cookieValue = (header: string): string => header.split(';')[0].slice(REFRESH_COOKIE_NAME.length + 1);
  const asCookie = (value: string) => ({ Cookie: `${REFRESH_COOKIE_NAME}=${value}` });

  const requestCode = async (phone: string): Promise<string> => {
    await http().post('/api/v1/auth/otp/request').send({ phone }).expect(201);
    const code = codes.get(phone);
    expect(code).toMatch(/^\d{6}$/);
    return code as string;
  };

  const setStatus = (phone: string, status: 'active' | 'suspended') =>
    ds.query('UPDATE "users" SET status = $1 WHERE phone = $2', [status, phone]);

  const mobileSignIn = async (): Promise<{ phone: string; refreshToken: string }> => {
    const phone = randomPhone();
    const code = await requestCode(phone);
    const res = await http().post('/api/v1/auth/otp/verify').send({ phone, code }).expect(201);
    return { phone, refreshToken: res.body.tokens.refreshToken as string };
  };

  const webSignIn = async (): Promise<{ phone: string; token: string }> => {
    const phone = randomPhone();
    const code = await requestCode(phone);
    const res = await http().post('/api/v1/auth/web/otp/verify').set(web).send({ phone, code }).expect(201);
    const header = refreshCookie(res);
    expect(header).toBeDefined();
    return { phone, token: cookieValue(header as string) };
  };

  it('mobile: a suspended account gets the OTP verify 401 account_suspended, and the session is revoked for good', async () => {
    const { phone, refreshToken } = await mobileSignIn();
    await setStatus(phone, 'suspended');

    // Same status and body shape as OTP verify for a suspended account.
    const verify = await http()
      .post('/api/v1/auth/otp/verify')
      .send({ phone, code: await requestCode(phone) })
      .expect(401);
    const refused = await http().post('/api/v1/auth/refresh').send({ refreshToken }).expect(401);
    expect(refused.body).toEqual(verify.body);
    expect(refused.body).toEqual({
      statusCode: 401,
      code: 'account_suspended',
      message: 'Account is suspended or banned',
    });

    // Reactivation does not revive the revoked session; the user signs in again.
    await setStatus(phone, 'active');
    const after = await http().post('/api/v1/auth/refresh').send({ refreshToken }).expect(401);
    expect(after.body.code).toBeUndefined();
    expect(after.body.message).toBe('Refresh token revoked or expired');
    const fresh = await http()
      .post('/api/v1/auth/otp/verify')
      .send({ phone, code: await requestCode(phone) })
      .expect(201);
    await http().post('/api/v1/auth/refresh').send({ refreshToken: fresh.body.tokens.refreshToken }).expect(201);
  });

  it('web: a suspended account gets 401 account_suspended, the cookie is cleared and the session revoked for good', async () => {
    const { phone, token } = await webSignIn();
    await setStatus(phone, 'suspended');

    const refused = await http().post('/api/v1/auth/web/refresh').set({ ...web, ...asCookie(token) }).expect(401);
    expect(refused.body).toEqual({
      statusCode: 401,
      code: 'account_suspended',
      message: 'Account is suspended or banned',
    });
    const cleared = refreshCookie(refused);
    expect(cleared).toContain('Expires=Thu, 01 Jan 1970');
    expect(cleared).toContain('Path=/api/v1/auth/web');

    await setStatus(phone, 'active');
    const after = await http().post('/api/v1/auth/web/refresh').set({ ...web, ...asCookie(token) }).expect(401);
    expect(after.body.code).toBe('refresh_invalid');
    expect(refreshCookie(after)).toContain('Expires=Thu, 01 Jan 1970');
  });

  it('active accounts refresh exactly as before on mobile and web', async () => {
    const mobile = await mobileSignIn();
    const rotated = await http().post('/api/v1/auth/refresh').send({ refreshToken: mobile.refreshToken }).expect(201);
    expect(Object.keys(rotated.body).sort()).toEqual(['accessToken', 'refreshToken']);
    expect(refreshCookie(rotated)).toBeUndefined();

    const site = await webSignIn();
    const res = await http().post('/api/v1/auth/web/refresh').set({ ...web, ...asCookie(site.token) }).expect(201);
    expect(Object.keys(res.body)).toEqual(['accessToken']);
    const next = refreshCookie(res);
    expect(next).toContain('HttpOnly');
    expect(cookieValue(next as string)).not.toBe(site.token);
  });
});
