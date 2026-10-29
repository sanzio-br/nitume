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
import { TokenService } from '../src/auth/token.service';
import { REFRESH_COOKIE_NAME } from '../src/auth/web/refresh-cookie.service';
import { corsOptionsDelegate } from '../src/common/cors';

/**
 * WQ-8 (owner, 2026-10-28): the website keeps the access token in memory and
 * the refresh token in an httpOnly cookie on /api/v1/auth/web/*. Mobile
 * /auth/* routes keep the refresh token in the JSON body, unchanged.
 */
describe('Web auth refresh cookie (WQ-8, e2e)', () => {
  const WEB_ORIGIN = 'https://web.nitume.test';
  const COOKIE_PATH = '/api/v1/auth/web';
  let app: INestApplication<App>;
  let baseUrl: string;
  let nodeEnv: string;
  let maxAgeSeconds: number;
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
    nodeEnv = config.get<string>('nodeEnv', 'development');
    maxAgeSeconds = app.get(TokenService).refreshTtlSeconds();
    await app.init();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    const ds = app.get(DataSource);
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

  const setCookies = (res: request.Response): string[] => {
    const raw = res.headers['set-cookie'] as string[] | string | undefined;
    if (raw === undefined) {
      return [];
    }
    return Array.isArray(raw) ? raw : [raw];
  };
  const refreshCookie = (res: request.Response): string | undefined =>
    setCookies(res).find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
  const cookieValue = (header: string): string => header.split(';')[0].slice(REFRESH_COOKIE_NAME.length + 1);
  const asCookie = (value: string) => ({ Cookie: `${REFRESH_COOKIE_NAME}=${value}` });

  const requestCode = async (phone: string): Promise<string> => {
    await http().post('/api/v1/auth/otp/request').send({ phone }).expect(201);
    const code = codes.get(phone);
    expect(code).toMatch(/^\d{6}$/);
    return code as string;
  };

  /** Signs a new customer in on the web route; returns the response and cookie value. */
  const webSignIn = async (): Promise<{ res: request.Response; token: string; header: string }> => {
    const phone = randomPhone();
    const code = await requestCode(phone);
    const res = await http().post('/api/v1/auth/web/otp/verify').set(web).send({ phone, code }).expect(201);
    const header = refreshCookie(res);
    expect(header).toBeDefined();
    return { res, token: cookieValue(header as string), header: header as string };
  };

  it('web OTP verify sets the httpOnly refresh cookie and returns only the access token', async () => {
    const { res, token, header } = await webSignIn();
    expect(res.body.user).toMatchObject({ role: 'customer' });
    expect(typeof res.body.tokens.accessToken).toBe('string');
    expect(res.body.tokens.refreshToken).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain(token);

    expect(token.split('.')).toHaveLength(3);
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Strict');
    expect(header).toContain(`Path=${COOKIE_PATH}`);
    expect(header).toContain(`Max-Age=${maxAgeSeconds}`);
    expect(header.includes('; Secure')).toBe(nodeEnv !== 'development');
    expect(res.headers['access-control-allow-origin']).toBe(WEB_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('refresh via the cookie rotates it; the used cookie is refused and cleared', async () => {
    const { token } = await webSignIn();
    const res = await http().post('/api/v1/auth/web/refresh').set({ ...web, ...asCookie(token) }).expect(201);
    expect(Object.keys(res.body)).toEqual(['accessToken']);
    const rotated = refreshCookie(res);
    expect(rotated).toBeDefined();
    expect(rotated).toContain('HttpOnly');
    expect(rotated).toContain(`Path=${COOKIE_PATH}`);
    const next = cookieValue(rotated as string);
    expect(next).not.toBe(token);

    const reused = await http().post('/api/v1/auth/web/refresh').set({ ...web, ...asCookie(token) }).expect(401);
    expect(reused.body.code).toBe('refresh_invalid');
    expect(refreshCookie(reused)).toContain('Expires=Thu, 01 Jan 1970');

    // The rotated cookie still works once.
    await http().post('/api/v1/auth/web/refresh').set({ ...web, ...asCookie(next) }).expect(201);
  });

  it('refresh without a cookie or with an invalid one is 401', async () => {
    const missing = await http().post('/api/v1/auth/web/refresh').set(web).expect(401);
    expect(missing.body.code).toBe('refresh_cookie_missing');

    const invalid = await http()
      .post('/api/v1/auth/web/refresh')
      .set({ ...web, ...asCookie('not-a-jwt-at-all') })
      .expect(401);
    expect(invalid.body.code).toBe('refresh_invalid');
    expect(refreshCookie(invalid)).toContain('Expires=Thu, 01 Jan 1970');
  });

  it('cookie routes refuse a missing or foreign Origin (CSRF) with 403 web_origin_not_allowed', async () => {
    const { token } = await webSignIn();
    const foreign = await http()
      .post('/api/v1/auth/web/refresh')
      .set({ Origin: 'https://evil.example', ...asCookie(token) })
      .expect(403);
    expect(foreign.body.code).toBe('web_origin_not_allowed');
    expect(refreshCookie(foreign)).toBeUndefined();
    const none = await http().post('/api/v1/auth/web/logout').set(asCookie(token)).expect(403);
    expect(none.body.code).toBe('web_origin_not_allowed');
    // Still valid: the refused calls neither rotated nor revoked it.
    await http().post('/api/v1/auth/web/refresh').set({ ...web, ...asCookie(token) }).expect(201);
  });

  it('sign-out revokes the refresh session and clears the cookie', async () => {
    const { token } = await webSignIn();
    const res = await http().post('/api/v1/auth/web/logout').set({ ...web, ...asCookie(token) }).expect(201);
    expect(res.body).toEqual({ message: 'Signed out' });
    const cleared = refreshCookie(res);
    expect(cleared).toContain(`Path=${COOKIE_PATH}`);
    expect(cleared).toContain('Expires=Thu, 01 Jan 1970');
    const after = await http().post('/api/v1/auth/web/refresh').set({ ...web, ...asCookie(token) }).expect(401);
    expect(after.body.code).toBe('refresh_invalid');

    // Without a cookie, sign-out still answers and clears.
    const bare = await http().post('/api/v1/auth/web/logout').set(web).expect(201);
    expect(refreshCookie(bare)).toContain('Expires=Thu, 01 Jan 1970');
  });

  it('mobile body-based verify and refresh are unchanged (no cookie)', async () => {
    const phone = randomPhone();
    const code = await requestCode(phone);
    const verify = await http().post('/api/v1/auth/otp/verify').send({ phone, code }).expect(201);
    expect(typeof verify.body.tokens.accessToken).toBe('string');
    expect(typeof verify.body.tokens.refreshToken).toBe('string');
    expect(refreshCookie(verify)).toBeUndefined();

    const refreshed = await http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: verify.body.tokens.refreshToken })
      .expect(201);
    expect(Object.keys(refreshed.body).sort()).toEqual(['accessToken', 'refreshToken']);
    expect(refreshed.body.refreshToken).not.toBe(verify.body.tokens.refreshToken);
    expect(refreshCookie(refreshed)).toBeUndefined();

    await http().post('/api/v1/auth/refresh').send({ refreshToken: verify.body.tokens.refreshToken }).expect(401);
    await http().post('/api/v1/auth/refresh').send({}).expect(400);

    const logout = await http()
      .post('/api/v1/auth/logout')
      .set({ Authorization: `Bearer ${refreshed.body.accessToken}` })
      .send({ refreshToken: refreshed.body.refreshToken })
      .expect(201);
    expect(refreshCookie(logout)).toBeUndefined();
    await http().post('/api/v1/auth/refresh').send({ refreshToken: refreshed.body.refreshToken }).expect(401);
  });

  it('CORS allows credentials only for the configured website origin', async () => {
    const allowed = await http()
      .options('/api/v1/auth/web/refresh')
      .set({ Origin: WEB_ORIGIN, 'Access-Control-Request-Method': 'POST' })
      .expect(204);
    expect(allowed.headers['access-control-allow-origin']).toBe(WEB_ORIGIN);
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const other = await http()
      .options('/api/v1/auth/web/refresh')
      .set({ Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' })
      .expect(204);
    expect(other.headers['access-control-allow-credentials']).toBeUndefined();
    expect(other.headers['access-control-allow-origin']).not.toBe('*');
  });
});
