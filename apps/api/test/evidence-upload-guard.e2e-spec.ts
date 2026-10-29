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
import { applyEvidenceBodyLimit } from '../src/evidence/evidence-upload';
import { RunnersService } from '../src/runners/runners.service';
import { UsersService } from '../src/users/users.service';
import { deleteRunnerVerifications, readyRunner } from './support/runner-fixtures';

/**
 * Issue #39 (owner, 2026-10-29): only the runner on the current assignment
 * uploads task evidence, in the RUNNER_UPLOAD_STATES of v-evidence-capture
 * (409 evidence_not_allowed otherwise); admins keep their path. Customers
 * and other runners get 403 evidence_upload_forbidden and nothing is
 * stored. GET /errands/:id/evidence is unchanged. Every row is removed in
 * afterAll by tracked id; no append-only table is written.
 */
describe('Evidence upload guard, issue #39 (e2e)', () => {
  let app: INestApplication<App>;
  let baseUrl: string;
  const userIds: string[] = [];
  const errandIds: string[] = [];

  const randomPhone = (): string => `+2547${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const tokenFor = (user: { id: string; role: UserRole; phone: string }): string =>
    new JwtService().sign(
      { sub: user.id, role: user.role, phone: user.phone, type: 'access' },
      { secret: app.get(ConfigService).get<string>('jwt.accessSecret') as string, expiresIn: '5m' },
    );

  type Actor = { id: string; token: string; profileId: string | null };

  const makeUser = async (role: UserRole): Promise<Actor> => {
    const user = await app.get(UsersService).create({ phone: randomPhone(), role });
    userIds.push(user.id);
    let profileId: string | null = null;
    if (role === UserRole.CUSTOMER) {
      profileId = (await app.get(CustomersService).createForUser(user.id)).id;
    } else if (role === UserRole.RUNNER) {
      profileId = (await app.get(RunnersService).createForUser(user.id)).id;
      await readyRunner(app.get(DataSource), profileId);
    }
    return { id: user.id, token: tokenFor(user), profileId };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    // As main.ts (row 252): before init, so it runs ahead of the default parser.
    applyEvidenceBodyLimit(app, app.get(ConfigService), 'api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    const ds = app.get(DataSource);
    await sleep(500);
    if (errandIds.length > 0) {
      await ds.query(
        `DELETE FROM "payment_transactions" WHERE "paymentId" IN
           (SELECT id FROM "payments" WHERE "errandId" = ANY($1))`,
        [errandIds],
      );
      await ds.query('DELETE FROM "payments" WHERE "errandId" = ANY($1)', [errandIds]);
      await ds.query('DELETE FROM "refund_reviews" WHERE "errandId" = ANY($1)', [errandIds]);
      await ds.query('DELETE FROM "disputes" WHERE "errandId" = ANY($1)', [errandIds]);
      for (const table of [
        'evidence',
        'price_change_requests',
        'runner_locations',
        'errand_assignments',
        'errand_status_history',
        'errand_items',
        'errand_locations',
        'quotes',
        'notification_log',
      ]) {
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
          await sleep(300);
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
      await ds.query(
        `DELETE FROM "runner_locations" WHERE "runnerProfileId" IN
           (SELECT id FROM "runner_profiles" WHERE "userId" = ANY($1))`,
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

  const SITE = { lat: -4.04, lng: 39.7 };
  const buyForMe = {
    category: 'buy_for_me',
    description: 'Buy a gas refill',
    budget: 500,
    locations: [{ pointType: 'dropoff', lat: SITE.lat, lon: SITE.lng, addressText: 'Links Road, Nyali' }],
  };

  const setStatus = (actor: Actor, errandId: string, to: string, expected = 200) =>
    http().patch(`/api/v1/errands/${errandId}/status`).set(bearer(actor.token)).send({ to }).expect(expected);

  /** A send_to_runner Buy For Me task, paid, accepted by `runner`, moved on to `to`. */
  const job = async (customer: Actor, admin: Actor, runner: Actor, to: 'RUNNER_EN_ROUTE' | 'IN_PROGRESS') => {
    const res = await http().post('/api/v1/errands').set(bearer(customer.token)).send(buyForMe).expect(201);
    const id = res.body.errand.id as string;
    errandIds.push(id);
    await http().post(`/api/v1/errands/${id}/submit`).set(bearer(customer.token)).expect(201);
    await http()
      .post(`/api/v1/errands/${id}/quote`)
      .set(bearer(admin.token))
      .send({ total: 1000, baseFee: 600, distanceFee: 400 })
      .expect(201);
    await setStatus(customer, id, 'ACCEPTED');
    const init = await http()
      .post(`/api/v1/payments/${id}/initiate`)
      .set(bearer(customer.token))
      .send({ merchantRoute: 'send_to_runner' })
      .expect(201);
    await http().post('/api/v1/payments/mpesa/callback').send({ reference: init.body.reference, resultCode: 0 }).expect(201);
    await http().post(`/api/v1/errands/${id}/assign`).set(bearer(admin.token)).send({ runnerProfileId: runner.profileId }).expect(201);
    await http().post(`/api/v1/errands/${id}/accept`).set(bearer(runner.token)).expect(200);
    if (to === 'IN_PROGRESS') {
      await setStatus(runner, id, 'ARRIVED');
      await setStatus(runner, id, 'IN_PROGRESS');
    }
    return id;
  };

  const photo = { type: 'photo', contentType: 'image/jpeg', data: Buffer.from('photo-bytes').toString('base64') };
  const upload = (actor: Actor, errandId: string, payload: Record<string, unknown> = photo) =>
    http().post(`/api/v1/errands/${errandId}/evidence`).set(bearer(actor.token)).send(payload);
  const evidenceCount = async (errandId: string) =>
    Number(((await db().query('SELECT COUNT(*) AS n FROM "evidence" WHERE "errandId" = $1', [errandId])) as { n: string }[])[0].n);

  it('refuses the task owner (customer) with 403 evidence_upload_forbidden, before and during the task', async () => {
    const [customer, admin, runner] = [await makeUser(UserRole.CUSTOMER), await makeUser(UserRole.ADMIN), await makeUser(UserRole.RUNNER)];
    const draft = await http().post('/api/v1/errands').set(bearer(customer.token)).send(buyForMe).expect(201);
    errandIds.push(draft.body.errand.id as string);
    const id = await job(customer, admin, runner, 'IN_PROGRESS');
    for (const errandId of [draft.body.errand.id as string, id]) {
      for (const payload of [photo, { ...photo, type: 'receipt' }, { type: 'video', contentType: 'video/mp4', data: photo.data }]) {
        const res = await upload(customer, errandId, payload).expect(403);
        expect(res.body).toMatchObject({ statusCode: 403, code: 'evidence_upload_forbidden' });
      }
      expect(await evidenceCount(errandId)).toBe(0);
    }
  });

  it('refuses a customer who does not own the task with the same 403', async () => {
    const [customer, other, admin, runner] = [
      await makeUser(UserRole.CUSTOMER),
      await makeUser(UserRole.CUSTOMER),
      await makeUser(UserRole.ADMIN),
      await makeUser(UserRole.RUNNER),
    ];
    const id = await job(customer, admin, runner, 'IN_PROGRESS');
    expect((await upload(other, id).expect(403)).body).toMatchObject({ code: 'evidence_upload_forbidden' });
  });

  it('refuses a runner who is not assigned with 403 evidence_upload_forbidden', async () => {
    const [customer, admin, runner, other] = [
      await makeUser(UserRole.CUSTOMER),
      await makeUser(UserRole.ADMIN),
      await makeUser(UserRole.RUNNER),
      await makeUser(UserRole.RUNNER),
    ];
    const id = await job(customer, admin, runner, 'IN_PROGRESS');
    expect((await upload(other, id).expect(403)).body).toMatchObject({ code: 'evidence_upload_forbidden' });
    expect((await upload(other, id, { ...photo, type: 'receipt' }).expect(403)).body).toMatchObject({ code: 'evidence_upload_forbidden' });
    expect(await evidenceCount(id)).toBe(0);
  });

  it('lets the assigned runner upload in allowed states and answers 409 evidence_not_allowed in others', async () => {
    const [customer, admin, runner] = [await makeUser(UserRole.CUSTOMER), await makeUser(UserRole.ADMIN), await makeUser(UserRole.RUNNER)];
    const id = await job(customer, admin, runner, 'RUNNER_EN_ROUTE');
    const early = await upload(runner, id).expect(409);
    expect(early.body).toMatchObject({ code: 'evidence_not_allowed', status: 'RUNNER_EN_ROUTE', type: 'photo' });
    await setStatus(runner, id, 'ARRIVED');
    await upload(runner, id).expect(201);
    await setStatus(runner, id, 'IN_PROGRESS');
    const ok = await upload(runner, id, { ...photo, type: 'receipt' }).expect(201);
    expect(ok.body).toMatchObject({ errandId: id, type: 'receipt', uploadedBy: runner.id });
    expect(ok.body).not.toHaveProperty('s3Key');
    await setStatus(runner, id, 'AWAITING_CUSTOMER');
    expect((await upload(runner, id).expect(409)).body).toMatchObject({ code: 'evidence_not_allowed', status: 'AWAITING_CUSTOMER', type: 'photo' });
    expect(await evidenceCount(id)).toBe(2);
  });

  it('keeps the admin path and the read view (customer, runner and admin still list)', async () => {
    const [customer, admin, runner] = [await makeUser(UserRole.CUSTOMER), await makeUser(UserRole.ADMIN), await makeUser(UserRole.RUNNER)];
    const id = await job(customer, admin, runner, 'RUNNER_EN_ROUTE');
    // Admin: any type, any state (mediation), as before.
    const byAdmin = await upload(admin, id, { type: 'document', contentType: 'application/pdf', data: photo.data }).expect(201);
    expect(byAdmin.body).toMatchObject({ type: 'document', uploadedBy: admin.id });
    await setStatus(runner, id, 'ARRIVED');
    await upload(runner, id).expect(201);
    await upload(customer, id).expect(403);
    for (const viewer of [customer, runner, admin]) {
      const list = await http().get(`/api/v1/errands/${id}/evidence`).set(bearer(viewer.token)).expect(200);
      expect(list.body).toHaveLength(2);
      expect(list.body[0]).not.toHaveProperty('s3Key');
      expect(list.body[0]).toHaveProperty('urlExpiresAt');
    }
  });
});
