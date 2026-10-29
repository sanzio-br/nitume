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
import { deleteRunnerVerifications, readyRunner } from './support/runner-fixtures';

/**
 * Issue #35 (owner WQ-43, 2026-10-29): customers and runners get task
 * history rows without `note` and `actorId` (internal ops notes, staff
 * identities), on GET /errands/:id/history and on the history row of every
 * transition response. Admin responses are unchanged. Every row created
 * here is removed again in afterAll by tracked id.
 */
describe('Task history privacy for customers and runners (e2e, issue #35)', () => {
  let app: INestApplication<App>;
  let baseUrl: string;
  const userIds: string[] = [];
  const errandIds: string[] = [];

  /** The only keys a customer or runner history row may carry. */
  const PARTY_KEYS = ['actorType', 'createdAt', 'errandId', 'fromStatus', 'id', 'toStatus'];
  const EXPIRY_REASON = 'Customer unreachable after the deadline, ops call log #77.';
  const ASSIGN_NOTE = 'Ops: runner knows the shop owner, call ahead.';

  const randomPhone = (): string => `+2547${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const tokenFor = (user: { id: string; role: UserRole; phone: string }): string =>
    new JwtService().sign(
      { sub: user.id, role: user.role, phone: user.phone, type: 'access' },
      { secret: app.get(ConfigService).get<string>('jwt.accessSecret') as string, expiresIn: '5m' },
    );

  type Actor = { id: string; token: string; profileId: string | null };

  const makeUser = async (role: UserRole, displayName?: string): Promise<Actor> => {
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
      await readyRunner(app.get(DataSource), profileId);
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
    // Let queued notification jobs for these rows finish first.
    await sleep(500);
    if (errandIds.length > 0) {
      await ds.query(
        `DELETE FROM "payment_transactions" WHERE "paymentId" IN
           (SELECT id FROM "payments" WHERE "errandId" = ANY($1))`,
        [errandIds],
      );
      await ds.query('DELETE FROM "payments" WHERE "errandId" = ANY($1)', [errandIds]);
      await ds.query('DELETE FROM "refund_reviews" WHERE "errandId" = ANY($1)', [errandIds]);
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

  const buyForMe = {
    category: 'buy_for_me',
    description: 'Two bags of rice from the market',
    budget: 500,
    locations: [{ pointType: 'dropoff', lat: -4.04, lon: 39.7, addressText: 'Links Road, Nyali' }],
  };

  const setStatus = (actor: Actor, errandId: string, to: string, note?: string, expected = 200) =>
    http()
      .patch(`/api/v1/errands/${errandId}/status`)
      .set(bearer(actor.token))
      .send(note ? { to, note } : { to })
      .expect(expected);

  const history = async (actor: Actor, errandId: string) =>
    (await http().get(`/api/v1/errands/${errandId}/history`).set(bearer(actor.token)).expect(200))
      .body as Record<string, unknown>[];

  /** A customer/runner history row: only the party keys, nothing that names or quotes staff. */
  const expectPartyRow = (row: Record<string, unknown>, admin: Actor) => {
    expect(Object.keys(row).sort()).toEqual(PARTY_KEYS);
    expect(row).not.toHaveProperty('note');
    expect(row).not.toHaveProperty('actorId');
    expect(row).not.toHaveProperty('actor');
    expect(JSON.stringify(row)).not.toContain(admin.id);
  };

  const expectPartyHistory = (rows: Record<string, unknown>[], admin: Actor) => {
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expectPartyRow(row, admin);
    }
    const body = JSON.stringify(rows);
    expect(body).not.toContain(EXPIRY_REASON);
    expect(body).not.toContain(ASSIGN_NOTE);
  };

  /** Creates, submits, quotes, accepts and pays an errand, checking each customer response. */
  const paidErrand = async (customer: Actor, admin: Actor) => {
    const created = await http().post('/api/v1/errands').set(bearer(customer.token)).send(buyForMe).expect(201);
    errandIds.push(created.body.errand.id);
    const id = created.body.errand.id as string;
    // The draft row carries a system note ("Errand created as draft"): hidden too.
    expectPartyRow(created.body.history, admin);
    expect(created.body.history).toMatchObject({ errandId: id, fromStatus: null, toStatus: 'DRAFT', actorType: 'customer' });

    const submitted = await http().post(`/api/v1/errands/${id}/submit`).set(bearer(customer.token)).expect(201);
    expectPartyRow(submitted.body.history, admin);
    expect(submitted.body.history).toMatchObject({ fromStatus: 'DRAFT', toStatus: 'REQUESTED', actorType: 'customer' });

    await http()
      .post(`/api/v1/errands/${id}/quote`)
      .set(bearer(admin.token))
      .send({ total: 1000, baseFee: 600, distanceFee: 400 })
      .expect(201);
    const accepted = await setStatus(customer, id, 'ACCEPTED');
    expectPartyRow(accepted.body.history, admin);
    expect(accepted.body.history).toMatchObject({ fromStatus: 'QUOTED', toStatus: 'ACCEPTED' });

    const init = await http()
      .post(`/api/v1/payments/${id}/initiate`)
      .set(bearer(customer.token))
      .send({ merchantRoute: 'send_to_runner' })
      .expect(201);
    await http()
      .post('/api/v1/payments/mpesa/callback')
      .send({ reference: init.body.reference, resultCode: 0 })
      .expect(201);
    return id;
  };

  it('an admin-expired task: the customer sees no reason or admin id, the admin sees both', async () => {
    const customer = await makeUser(UserRole.CUSTOMER);
    const admin = await makeUser(UserRole.ADMIN, 'Ops Wanjiru');
    const errandId = await paidErrand(customer, admin);

    await db().query(`UPDATE "errands" SET "deadlineAt" = now() - interval '1 minute' WHERE id = $1`, [errandId]);
    const expired = await http()
      .post(`/api/v1/errands/${errandId}/expire`)
      .set(bearer(admin.token))
      .send({ reason: EXPIRY_REASON, fromStatus: 'PAYMENT_CONFIRMED' })
      .expect(200);
    // Admin response: unchanged, with the note and the admin's id.
    expect(expired.body.history).toMatchObject({
      fromStatus: 'PAYMENT_CONFIRMED',
      toStatus: 'EXPIRED',
      actorType: 'admin',
      actorId: admin.id,
      note: EXPIRY_REASON,
    });

    const own = await history(customer, errandId);
    expectPartyHistory(own, admin);
    expect(own.at(-1)).toMatchObject({ fromStatus: 'PAYMENT_CONFIRMED', toStatus: 'EXPIRED', actorType: 'admin' });
    expect(typeof own.at(-1)?.createdAt).toBe('string');

    const full = await history(admin, errandId);
    expect(full.length).toBe(own.length);
    expect(full.map((r) => r.id)).toEqual(own.map((r) => r.id));
    expect(full.at(-1)).toMatchObject({
      toStatus: 'EXPIRED',
      actorType: 'admin',
      actorId: admin.id,
      note: EXPIRY_REASON,
      actor: { id: admin.id, displayName: 'Ops Wanjiru' },
    });
    expect(full[0]).toMatchObject({ toStatus: 'DRAFT', actorId: customer.id, note: 'Errand created as draft' });
  });

  it('a task assigned with an admin note: the runner and the customer see no note or admin id, the admin does', async () => {
    const customer = await makeUser(UserRole.CUSTOMER);
    const admin = await makeUser(UserRole.ADMIN, 'Ops Otieno');
    const runner = await makeUser(UserRole.RUNNER);
    const errandId = await paidErrand(customer, admin);

    await http()
      .post(`/api/v1/errands/${errandId}/assign`)
      .set(bearer(admin.token))
      .send({ runnerProfileId: runner.profileId, note: ASSIGN_NOTE })
      .expect(201);

    // The offered runner.
    const offered = await history(runner, errandId);
    expectPartyHistory(offered, admin);
    expect(offered.at(-1)).toMatchObject({ fromStatus: 'PAYMENT_CONFIRMED', toStatus: 'RUNNER_ASSIGNED', actorType: 'admin' });

    // Runner transition responses carry the same party row.
    const accepted = await http().post(`/api/v1/errands/${errandId}/accept`).set(bearer(runner.token)).expect(200);
    expectPartyRow(accepted.body.history, admin);
    expect(accepted.body.history).toMatchObject({ fromStatus: 'RUNNER_ASSIGNED', toStatus: 'RUNNER_EN_ROUTE', actorType: 'runner' });
    expect(accepted.body.history).not.toHaveProperty('actorId');
    const arrived = await setStatus(runner, errandId, 'ARRIVED');
    expectPartyRow(arrived.body.history, admin);
    expect(arrived.body.history).toMatchObject({ fromStatus: 'RUNNER_EN_ROUTE', toStatus: 'ARRIVED', actorType: 'runner' });

    const runnerView = await history(runner, errandId);
    expectPartyHistory(runnerView, admin);
    expect(JSON.stringify(runnerView)).not.toContain(customer.id);
    expect(runnerView.map((r) => r.toStatus)).toEqual(
      expect.arrayContaining(['RUNNER_ASSIGNED', 'RUNNER_EN_ROUTE', 'ARRIVED']),
    );

    const customerView = await history(customer, errandId);
    expectPartyHistory(customerView, admin);
    expect(JSON.stringify(customerView)).not.toContain(runner.id);
    expect(customerView.map((r) => r.id)).toEqual(runnerView.map((r) => r.id));

    // Admin: unchanged rows plus actor names.
    const full = await history(admin, errandId);
    expect(full.map((r) => r.id)).toEqual(runnerView.map((r) => r.id));
    expect(full.find((r) => r.toStatus === 'RUNNER_ASSIGNED')).toMatchObject({
      actorType: 'admin',
      actorId: admin.id,
      note: ASSIGN_NOTE,
      actor: { id: admin.id, displayName: 'Ops Otieno' },
    });
    expect(full.find((r) => r.toStatus === 'ARRIVED')).toMatchObject({ actorType: 'runner', actorId: runner.id });
  });
});
