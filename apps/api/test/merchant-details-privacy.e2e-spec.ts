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
import { TestSocket, connectSocket } from './support/socket-client';

/**
 * Issue #28 (owner, 2026-10-29): a customer receives the merchant's
 * Till/Paybill/account numbers only once the fee payment has completed, on
 * GET /errands/:id (and every errand response), GET /payments/:errandId and
 * the merchant_details:updated / merchant_details:changed socket events.
 * Runner and admin responses are unchanged. Every row created here is
 * removed again in afterAll.
 */
describe('Merchant numbers hidden from the customer until the fees are paid (e2e, issue #28)', () => {
  let app: INestApplication<App>;
  let baseUrl: string;
  const userIds: string[] = [];
  const errandIds: string[] = [];
  const sockets: TestSocket[] = [];

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

  const socketFor = async (actor: Actor, errandId: string): Promise<TestSocket> => {
    const s = await connectSocket(baseUrl, actor.token);
    sockets.push(s);
    await expect(s.emitWithAck('errand:join', { errandId })).resolves.toMatchObject({ ok: true });
    return s;
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
    for (const s of sockets) {
      s.close();
    }
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
      const tables: { table_name: string }[] = await ds.query(
        `SELECT table_name FROM information_schema.columns
          WHERE table_schema = 'public' AND column_name = 'errandId'
            AND table_name NOT IN ('errands', 'notifications')`,
      );
      for (const { table_name } of tables) {
        await ds.query(`DELETE FROM "${table_name}" WHERE "errandId" = ANY($1)`, [errandIds]);
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
      await deleteRunnerVerifications(ds, userIds);
      await ds.query('DELETE FROM "runner_profiles" WHERE "userId" = ANY($1)', [userIds]);
      await ds.query('DELETE FROM "customer_profiles" WHERE "userId" = ANY($1)', [userIds]);
      await ds.query('DELETE FROM "users" WHERE "id" = ANY($1)', [userIds]);
    }
    await app.close();
  });

  const http = () => request(baseUrl);
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  const NO_ERRAND_NUMBERS = { merchantTillNumber: null, merchantPaybillNumber: null, merchantAccountReference: null };
  const NO_NUMBERS = { tillNumber: null, paybillNumber: null, accountReference: null };

  const setMerchant = (admin: Actor, errandId: string, body: Record<string, string>) =>
    http().put(`/api/v1/errands/${errandId}/merchant-details`).set(bearer(admin.token)).send(body).expect(200);

  const errandOf = (actor: Actor, errandId: string, expected = 200) =>
    http().get(`/api/v1/errands/${errandId}`).set(bearer(actor.token)).expect(expected);

  const paymentsOf = (actor: Actor, errandId: string, expected = 200) =>
    http().get(`/api/v1/payments/${errandId}`).set(bearer(actor.token)).expect(expected);

  const listItem = async (actor: Actor, errandId: string) => {
    const res = await http().get('/api/v1/errands?limit=100').set(bearer(actor.token)).expect(200);
    return (res.body.items as { id: string }[]).find((e) => e.id === errandId) as Record<string, unknown>;
  };

  const byName = (name: string) => (d: { merchantName: string | null }) => d.merchantName === name;

  it('GET /errands, GET /payments and both socket events, before and after the fee payment, per role', async () => {
    const [customer, admin, runner] = [
      await makeUser(UserRole.CUSTOMER),
      await makeUser(UserRole.ADMIN),
      await makeUser(UserRole.RUNNER),
    ];
    const created = await http()
      .post('/api/v1/errands')
      .set(bearer(customer.token))
      .send({
        category: 'buy_for_me',
        description: 'Buy a gas refill',
        budget: 2500,
        locations: [{ pointType: 'dropoff', lat: -4.04, lon: 39.7, addressText: 'Links Road, Nyali' }],
      })
      .expect(201);
    const errandId = created.body.errand.id as string;
    errandIds.push(errandId);
    await http().post(`/api/v1/errands/${errandId}/submit`).set(bearer(customer.token)).expect(201);
    await http()
      .post(`/api/v1/errands/${errandId}/quote`)
      .set(bearer(admin.token))
      .send({ total: 1000 })
      .expect(201);

    const customerSocket = await socketFor(customer, errandId);
    const adminSocket = await socketFor(admin, errandId);

    // --- Before the fee payment ---------------------------------------
    await setMerchant(admin, errandId, { merchantName: 'Gas One', paybillNumber: '888880', accountReference: 'ACC-1' });
    const adminFirst = await adminSocket.waitFor('merchant_details:updated', byName('Gas One'));
    expect(adminFirst).toMatchObject({ paybillNumber: '888880', accountReference: 'ACC-1' });
    const customerFirst = await customerSocket.waitFor('merchant_details:updated', byName('Gas One'));
    expect(customerFirst).toMatchObject({ errandId, ...NO_NUMBERS });

    const accepted = await http()
      .patch(`/api/v1/errands/${errandId}/status`)
      .set(bearer(customer.token))
      .send({ to: 'ACCEPTED' })
      .expect(200);
    expect(accepted.body.errand).toMatchObject({ ...NO_ERRAND_NUMBERS, merchantDetailsAvailable: true });

    const before = await errandOf(customer, errandId);
    expect(before.body).toMatchObject({
      ...NO_ERRAND_NUMBERS,
      merchantName: 'Gas One',
      merchantDetailsAvailable: true,
    });
    expect(await listItem(customer, errandId)).toMatchObject(NO_ERRAND_NUMBERS);
    const adminBefore = await errandOf(admin, errandId);
    expect(adminBefore.body).toMatchObject({ merchantPaybillNumber: '888880', merchantAccountReference: 'ACC-1' });
    // A runner cannot read an unassigned task at all (unchanged).
    await errandOf(runner, errandId, 403);
    await paymentsOf(runner, errandId, 403);

    const init = await http()
      .post(`/api/v1/payments/${errandId}/initiate`)
      .set(bearer(customer.token))
      .send({ merchantRoute: 'merchant_direct' })
      .expect(201);
    expect(init.body.merchantDetailsAvailable).toBe(true);
    expect(init.body.merchantPayment).toMatchObject({ route: 'merchant_direct', merchantName: 'Gas One', ...NO_NUMBERS });

    const pending = await paymentsOf(customer, errandId);
    expect(pending.body.stkStatus).toBe('PENDING');
    expect(pending.body.merchantPayment).toMatchObject({ route: 'merchant_direct', amount: '2500.00', ...NO_NUMBERS });
    const adminPending = await paymentsOf(admin, errandId);
    expect(adminPending.body.merchantPayment).toMatchObject({ paybillNumber: '888880', accountReference: 'ACC-1' });

    // A change while the merchant-direct payment is pending sends both events.
    await setMerchant(admin, errandId, { merchantName: 'Gas Two', tillNumber: '123456' });
    for (const name of ['merchant_details:updated', 'merchant_details:changed']) {
      expect(await customerSocket.waitFor(name, byName('Gas Two'))).toMatchObject({ errandId, ...NO_NUMBERS });
      expect(await adminSocket.waitFor(name, byName('Gas Two'))).toMatchObject({ tillNumber: '123456' });
    }
    expect((await errandOf(customer, errandId)).body).toMatchObject(NO_ERRAND_NUMBERS);

    // --- The fee payment completes --------------------------------------
    await http()
      .post('/api/v1/payments/mpesa/callback')
      .send({ reference: init.body.reference, resultCode: 0 })
      .expect(201);

    const after = await errandOf(customer, errandId);
    expect(after.body.status).toBe('PAYMENT_CONFIRMED');
    expect(after.body).toMatchObject({ merchantName: 'Gas Two', merchantTillNumber: '123456', merchantPaybillNumber: null });
    expect(await listItem(customer, errandId)).toMatchObject({ merchantTillNumber: '123456' });
    const paid = await paymentsOf(customer, errandId);
    expect(paid.body.stkStatus).toBe('SUCCESS');
    expect(paid.body.merchantPayment).toMatchObject({ merchantName: 'Gas Two', tillNumber: '123456' });
    expect((await paymentsOf(admin, errandId)).body.merchantPayment).toMatchObject({ tillNumber: '123456' });
    expect((await errandOf(admin, errandId)).body).toMatchObject({ merchantTillNumber: '123456' });

    await http()
      .post(`/api/v1/errands/${errandId}/assign`)
      .set(bearer(admin.token))
      .send({ runnerProfileId: runner.profileId })
      .expect(201);
    expect((await errandOf(runner, errandId)).body).toMatchObject({ merchantTillNumber: '123456' });
    await paymentsOf(runner, errandId, 403);
    const runnerSocket = await socketFor(runner, errandId);

    await setMerchant(admin, errandId, { merchantName: 'Gas Three', paybillNumber: '400200', accountReference: 'ACC-3' });
    const full = { paybillNumber: '400200', accountReference: 'ACC-3', tillNumber: null };
    for (const name of ['merchant_details:updated', 'merchant_details:changed']) {
      for (const s of [customerSocket, adminSocket, runnerSocket]) {
        expect(await s.waitFor(name, byName('Gas Three'))).toMatchObject({ errandId, ...full });
      }
    }
    expect((await errandOf(customer, errandId)).body).toMatchObject({
      merchantPaybillNumber: '400200',
      merchantAccountReference: 'ACC-3',
    });
    expect((await paymentsOf(customer, errandId)).body.merchantPayment).toMatchObject({
      paybillNumber: '400200',
      accountReference: 'ACC-3',
      merchantDetailsChangedAfterPayment: true,
    });
  });

  it('a failed fee payment keeps the numbers hidden from the customer', async () => {
    const [customer, admin] = [await makeUser(UserRole.CUSTOMER), await makeUser(UserRole.ADMIN)];
    const created = await http()
      .post('/api/v1/errands')
      .set(bearer(customer.token))
      .send({
        category: 'pickup_delivery',
        description: 'Collect a parcel',
        budget: 900,
        locations: [
          { pointType: 'pickup', lat: -4.05, lon: 39.66, addressText: 'Moi Avenue' },
          { pointType: 'dropoff', lat: -4.04, lon: 39.7, addressText: 'Links Road, Nyali' },
        ],
      })
      .expect(201);
    const errandId = created.body.errand.id as string;
    errandIds.push(errandId);
    await http().post(`/api/v1/errands/${errandId}/submit`).set(bearer(customer.token)).expect(201);
    await http().post(`/api/v1/errands/${errandId}/quote`).set(bearer(admin.token)).send({ total: 800 }).expect(201);
    await setMerchant(admin, errandId, { merchantName: 'Courier', tillNumber: '765432' });
    await http()
      .patch(`/api/v1/errands/${errandId}/status`)
      .set(bearer(customer.token))
      .send({ to: 'ACCEPTED' })
      .expect(200);
    const init = await http()
      .post(`/api/v1/payments/${errandId}/initiate`)
      .set(bearer(customer.token))
      .send({ merchantRoute: 'merchant_direct' })
      .expect(201);
    await http()
      .post('/api/v1/payments/mpesa/callback')
      .send({ reference: init.body.reference, resultCode: 1032 })
      .expect(201);
    const failed = await paymentsOf(customer, errandId);
    expect(failed.body.stkStatus).toBe('FAILED');
    expect(failed.body.merchantPayment).toMatchObject(NO_NUMBERS);
    expect((await errandOf(customer, errandId)).body).toMatchObject(NO_ERRAND_NUMBERS);
    expect((await paymentsOf(admin, errandId)).body.merchantPayment).toMatchObject({ tillNumber: '765432' });
    expect((await errandOf(admin, errandId)).body).toMatchObject({ merchantTillNumber: '765432' });
  });
});
