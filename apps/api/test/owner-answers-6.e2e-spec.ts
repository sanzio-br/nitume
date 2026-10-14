import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ErrandStatus, StatusHistoryActor, UserRole } from '../src/common/enums';
import { ErrandsService } from '../src/errands/errands.service';
import { CustomersService } from '../src/customers/customers.service';
import { RunnersService } from '../src/runners/runners.service';
import { UsersService } from '../src/users/users.service';
import { PaymentsService } from '../src/payments/payments.service';
import { RunnerPayoutsService } from '../src/payments/runner-payouts.service';

/**
 * Contract checks for the owner answers 6 (BOARD rows 104-108: runner payout
 * ledger, reimbursement rules, purchase limit and decline) and the round-5
 * reviewer follow-ups. Every row created here is removed in afterAll.
 */
describe('Owner answers 6 (e2e)', () => {
  let app: INestApplication<App>;
  let baseUrl: string;
  const userIds: string[] = [];
  const errandIds: string[] = [];

  const randomPhone = (): string => `+2547${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;

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
    if (errandIds.length > 0) {
      await ds.query(
        `DELETE FROM "payment_transactions" WHERE "paymentId" IN
           (SELECT id FROM "payments" WHERE "errandId" = ANY($1))`,
        [errandIds],
      );
      await ds.query(
        `DELETE FROM "dispute_events" WHERE "disputeId" IN
           (SELECT id FROM "disputes" WHERE "errandId" = ANY($1))`,
        [errandIds],
      );
      // Payments and refund reviews reference price_change_requests.
      await ds.query('DELETE FROM "payments" WHERE "errandId" = ANY($1)', [errandIds]);
      // Overrides reference refund reviews and runner lines (row 136).
      await ds.query('ALTER TABLE "task_exposure_overrides" DISABLE TRIGGER USER');
      await ds.query('DELETE FROM "task_exposure_overrides" WHERE "errandId" = ANY($1)', [errandIds]);
      await ds.query('ALTER TABLE "task_exposure_overrides" ENABLE TRIGGER USER');
      // Corrections are append-only (DB trigger): lift it for the cleanup only.
      await ds.query('ALTER TABLE "refund_payout_corrections" DISABLE TRIGGER USER');
      await ds.query(
        `DELETE FROM "refund_payout_corrections" WHERE "refundReviewId" IN
           (SELECT id FROM "refund_reviews" WHERE "errandId" = ANY($1))`,
        [errandIds],
      );
      await ds.query('ALTER TABLE "refund_payout_corrections" ENABLE TRIGGER USER');
      // The runner payout ledger is append-only too (rows 107).
      await ds.query('ALTER TABLE "runner_payout_lines" DISABLE TRIGGER USER');
      await ds.query('DELETE FROM "runner_payout_lines" WHERE "relatedLineId" IS NOT NULL AND "errandId" = ANY($1)', [errandIds]);
      await ds.query('DELETE FROM "runner_payout_lines" WHERE "errandId" = ANY($1)', [errandIds]);
      await ds.query('ALTER TABLE "runner_payout_lines" ENABLE TRIGGER USER');
      await ds.query('DELETE FROM "refund_reviews" WHERE "errandId" = ANY($1)', [errandIds]);
      const tables: { table_name: string }[] = await ds.query(
        `SELECT table_name FROM information_schema.columns
          WHERE table_schema = 'public' AND column_name = 'errandId'
            AND table_name <> 'errands'`,
      );
      for (const { table_name } of tables) {
        await ds.query(`DELETE FROM "${table_name}" WHERE "errandId" = ANY($1)`, [errandIds]);
      }
      await ds.query('DELETE FROM "errands" WHERE id = ANY($1)', [errandIds]);
    }
    if (userIds.length > 0) {
      await ds.query('DELETE FROM "notifications" WHERE "userId" = ANY($1)', [userIds]);
      await ds.query('DELETE FROM "notification_log" WHERE "userId" = ANY($1)', [userIds]);
      await ds.query(
        `DELETE FROM "payment_methods" WHERE "customerProfileId" IN
           (SELECT id FROM "customer_profiles" WHERE "userId" = ANY($1))`,
        [userIds],
      );
      await ds.query('DELETE FROM "runner_profiles" WHERE "userId" = ANY($1)', [userIds]);
      await ds.query('DELETE FROM "customer_profiles" WHERE "userId" = ANY($1)', [userIds]);
      await ds.query('DELETE FROM "users" WHERE "id" = ANY($1)', [userIds]);
    }
    await app.close();
  });

  const http = () => request(baseUrl);
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const db = () => app.get(DataSource);

  const createErrand = async (customer: Actor, body: Record<string, unknown> = {}) => {
    const res = await http()
      .post('/api/v1/errands')
      .set(bearer(customer.token))
      .send({
        category: 'inspection',
        description: 'Check the apartment in Nyali',
        budget: 0,
        locations: [{ pointType: 'task_site', lat: -4.04, lon: 39.7, addressText: 'Links Road, Nyali' }],
        ...body,
      })
      .expect(201);
    errandIds.push(res.body.errand.id);
    return res.body.errand as { id: string };
  };

  const buyForMe = {
    category: 'buy_for_me',
    budget: 500,
    locations: [{ pointType: 'dropoff', lat: -4.04, lon: 39.7, addressText: 'Links Road, Nyali' }],
  };

  const setStatus = (actor: Actor, errandId: string, to: string, expected = 200) =>
    http().patch(`/api/v1/errands/${errandId}/status`).set(bearer(actor.token)).send({ to }).expect(expected);

  const submitAndQuote = async (customer: Actor, admin: Actor, errandId: string, expiresAt?: string) => {
    await http().post(`/api/v1/errands/${errandId}/submit`).set(bearer(customer.token)).expect(201);
    await http()
      .post(`/api/v1/errands/${errandId}/quote`)
      .set(bearer(admin.token))
      .send({ total: 1000, baseFee: 600, distanceFee: 400, ...(expiresAt ? { expiresAt } : {}) })
      .expect(201);
  };

  const pay = async (customer: Actor, errandId: string, body: Record<string, unknown> = {}) => {
    const init = await http()
      .post(`/api/v1/payments/${errandId}/initiate`)
      .set(bearer(customer.token))
      .send(body)
      .expect(201);
    await http()
      .post('/api/v1/payments/mpesa/callback')
      .send({ reference: init.body.reference, resultCode: 0 })
      .expect(201);
  };

  /** Paid send_to_runner Buy For Me (fees 500 + item 500 = 1000 to Nitume), assigned. */
  const paidAndAssigned = async () => {
    const customer = await makeUser(UserRole.CUSTOMER);
    const admin = await makeUser(UserRole.ADMIN, 'Finance Ops');
    const runner = await makeUser(UserRole.RUNNER);
    const errand = await createErrand(customer, buyForMe);
    await submitAndQuote(customer, admin, errand.id);
    await setStatus(customer, errand.id, 'ACCEPTED');
    await pay(customer, errand.id, { merchantRoute: 'send_to_runner' });
    await http()
      .post(`/api/v1/errands/${errand.id}/assign`)
      .set(bearer(admin.token))
      .send({ runnerProfileId: runner.profileId })
      .expect(201);
    return { customer, admin, runner, errand };
  };


  const upload = (actor: Actor, errandId: string, type = 'receipt') =>
    http()
      .post(`/api/v1/errands/${errandId}/evidence`)
      .set(bearer(actor.token))
      .send({ type, contentType: 'image/png', data: Buffer.from('receipt-bytes').toString('base64') })
      .expect(201);

  const linesOf = async (errandId: string) =>
    (await db().query(
      `SELECT id, kind, status, amount, "requestedAmount", "reviewReason", "runnerProfileId"
         FROM "runner_payout_lines" WHERE "errandId" = $1 ORDER BY kind::text`,
      [errandId],
    )) as { id: string; kind: string; status: string; amount: string | null; requestedAmount: string; reviewReason: string | null }[];

  const toConfirmed = async (customer: Actor, runner: Actor, errandId: string, receipt: boolean) => {
    for (const to of ['RUNNER_EN_ROUTE', 'ARRIVED', 'IN_PROGRESS']) {
      await setStatus(runner, errandId, to);
    }
    if (receipt) {
      await upload(runner, errandId);
    }
    await setStatus(runner, errandId, 'AWAITING_CUSTOMER');
    await setStatus(customer, errandId, 'COMPLETED');
    expect(await linesOf(errandId)).toEqual([]);
    // Fee 300 + item 500 wait for confirmation (one aggregate query).
    const pending = await http().get('/api/v1/runners/me/earnings').set(bearer(runner.token)).expect(200);
    expect(pending.body.pendingAmount).toBe('800.00');
    await app
      .get(ErrandsService)
      .transition(errandId, ErrandStatus.CONFIRMED, { type: StatusHistoryActor.SYSTEM }, 'Dispute window passed');
  };

  const code = () => `QR6${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1000)}`;

  it('CONFIRMED records a runner fee and an item reimbursement; payouts, corrections and the runner feed (rows 104, 107)', async () => {
    const { customer, admin, runner, errand } = await paidAndAssigned();
    await toConfirmed(customer, runner, errand.id, true);
    const lines = await linesOf(errand.id);
    expect(lines).toEqual([
      expect.objectContaining({ kind: 'item_reimbursement', status: 'payable', amount: '500.00', reviewReason: null }),
      expect.objectContaining({ kind: 'runner_fee', status: 'payable', amount: '300.00' }),
    ]);
    // Idempotent: a second confirmation hook run inserts nothing.
    await db().transaction((m) =>
      app.get(RunnerPayoutsService).recordConfirmed(m, errand.id),
    );
    expect(await linesOf(errand.id)).toHaveLength(2);

    const earnings = await http().get('/api/v1/runners/me/earnings').set(bearer(runner.token)).expect(200);
    expect(earnings.body).toMatchObject({
      currency: 'KES',
      availableAmount: '800.00',
      onHoldAmount: '0.00',
      paidAmount: '0.00',
      byKind: { runnerFee: { availableAmount: '300.00' }, itemReimbursement: { availableAmount: '500.00' } },
      weekTotal: '300.00',
    });
    expect(earnings.body.week).toHaveLength(7);
    await http().get('/api/v1/runners/me/earnings?from=2026-10-12&to=2026-10-01').set(bearer(runner.token)).expect(400);
    await http().get('/api/v1/runners/me/earnings').set(bearer(customer.token)).expect(403);
    await http().get('/api/v1/runner-payouts').set(bearer(runner.token)).expect(403);

    const ref = code();
    const paid = await http()
      .post('/api/v1/runner-payouts/mark-paid')
      .set(bearer(admin.token))
      .send({ lineIds: lines.map((l) => l.id), payoutReference: ref.toLowerCase() })
      .expect(200);
    expect(paid.body.items.map((i: { effectiveStatus: string }) => i.effectiveStatus)).toEqual(['paid', 'paid']);
    const locked = await http()
      .post('/api/v1/runner-payouts/mark-paid')
      .set(bearer(admin.token))
      .send({ lineIds: [lines[0].id], payoutReference: code() })
      .expect(409);
    expect(locked.body.code).toBe('runner_payout_locked');

    const feed = await http().get('/api/v1/runners/me/payout-lines?limit=10').set(bearer(runner.token)).expect(200);
    expect(feed.body.items[0]).toMatchObject({ kind: 'payout', status: 'paid', amount: '-800.00', reference: ref, errandId: errand.id });
    expect(feed.body.items.map((i: { amount: string }) => Number(i.amount)).reduce((a: number, b: number) => a + b, 0)).toBe(0);
    const perErrand = await http()
      .get(`/api/v1/runners/me/payout-lines?errandId=${errand.id}&kind=runner_fee,item_reimbursement`)
      .set(bearer(runner.token))
      .expect(200);
    expect(perErrand.body.items.map((i: { kind: string }) => i.kind).sort()).toEqual(['item_reimbursement', 'runner_fee']);
    expect(JSON.stringify(feed.body)).not.toContain(admin.id);

    // Reversal then re-send on the fee line; the DB refuses any edit of the paid line.
    const fee = lines.find((l) => l.kind === 'runner_fee')!;
    const rev = await http()
      .post(`/api/v1/runner-payouts/${fee.id}/corrections`)
      .set(bearer(admin.token))
      .send({ kind: 'reversal', newReference: code(), reason: 'Wrong number', expectedLatestCorrectionId: null })
      .expect(201);
    expect(rev.body).toMatchObject({ effectiveStatus: 'payable', effectivePayout: { state: 'reversed' }, correctionCeiling: '300.00' });
    const due = await http().get('/api/v1/runner-payouts?status=payable&limit=100').set(bearer(admin.token)).expect(200);
    expect(due.body.items.map((i: { id: string }) => i.id)).toContain(fee.id);
    const reusedRefund = await http()
      .post(`/api/v1/runner-payouts/${fee.id}/corrections`)
      .set(bearer(admin.token))
      .send({ kind: 'resent_payout', newReference: ref, newAmount: 300, reason: 'Sent again', expectedLatestCorrectionId: rev.body.corrections[0].id })
      .expect(409);
    expect(reusedRefund.body.code).toBe('payout_reference_reused');
    const resent = await http()
      .post(`/api/v1/runner-payouts/${fee.id}/corrections`)
      .set(bearer(admin.token))
      .send({ kind: 'resent_payout', newReference: code(), newAmount: 300, reason: 'Sent again', expectedLatestCorrectionId: rev.body.corrections[0].id })
      .expect(201);
    expect(resent.body.effectivePayout).toMatchObject({ state: 'sent', amount: '300.00' });
    await expect(
      db().query(`UPDATE "runner_payout_lines" SET "payoutReference" = 'X1' WHERE id = $1`, [fee.id]),
    ).rejects.toThrow(/final/);
    await expect(db().query('DELETE FROM "runner_payout_lines" WHERE id = $1', [fee.id])).rejects.toThrow(/append-only/);
    // An adjustment must belong to its obligation's runner and errand.
    const stranger = await makeUser(UserRole.RUNNER);
    await expect(
      db().query(
        `INSERT INTO "runner_payout_lines" ("runnerProfileId", "errandId", kind, status, "relatedLineId", note)
         VALUES ($1, $2, 'reversal', 'recorded', $3, 'not mine')`,
        [stranger.profileId, errand.id, fee.id],
      ),
    ).rejects.toThrow(/must match the runner and errand/);

    // The settle job still moves CONFIRMED -> SETTLED.
    await app.get(PaymentsService).settleErrand(errand.id);
  });

  it('no receipt at CONFIRMED puts the item line on hold for ops review, capped (row 105)', async () => {
    const { customer, admin, runner, errand } = await paidAndAssigned();
    await toConfirmed(customer, runner, errand.id, false);
    const [item, fee] = await linesOf(errand.id);
    expect(fee).toMatchObject({ kind: 'runner_fee', status: 'payable' });
    expect(item).toMatchObject({ kind: 'item_reimbursement', status: 'on_hold', amount: null, reviewReason: 'receipt_missing' });
    const count = await http().get('/api/v1/runner-payouts/count?status=on_hold').set(bearer(admin.token)).expect(200);
    expect(count.body.count).toBeGreaterThanOrEqual(1);
    const detail = await http().get(`/api/v1/runner-payouts/${item.id}`).set(bearer(admin.token)).expect(200);
    expect(detail.body).toMatchObject({ itemPaidToNitume: '500.00', approvalCeiling: '500.00', runner: { maxPurchaseAdvance: '3000.00' } });
    const over = await http()
      .post(`/api/v1/runner-payouts/${item.id}/review`)
      .set(bearer(admin.token))
      .send({ decision: 'approve', amount: 500.01 })
      .expect(400);
    expect(over.body).toMatchObject({ code: 'reimbursement_exceeds_cap', cap: '500.00' });
    const ok = await http()
      .post(`/api/v1/runner-payouts/${item.id}/review`)
      .set(bearer(admin.token))
      .send({ decision: 'approve', amount: 450, note: 'Receipt sent on WhatsApp' })
      .expect(200);
    expect(ok.body).toMatchObject({ status: 'payable', amount: '450.00', decidedBy: { id: admin.id } });
    // Ops can still flag a mismatch before paying it.
    const held = await http()
      .post(`/api/v1/runner-payouts/${item.id}/hold`)
      .set(bearer(admin.token))
      .send({ note: 'Total does not match' })
      .expect(200);
    expect(held.body).toMatchObject({ status: 'on_hold', reviewReason: 'receipt_mismatch', amount: null });
  });

  it('CANCELLED after the purchase: item claim with a receipt, on hold, never a runner fee (row 106)', async () => {
    const { admin, runner, errand } = await paidAndAssigned();
    await setStatus(admin, errand.id, 'CANCELLED');
    const photo = await upload(runner, errand.id, 'photo');
    const receipt = await upload(runner, errand.id);
    const url = '/api/v1/runners/me/reimbursement-claims';
    const noReceipt = await http()
      .post(url)
      .set(bearer(runner.token))
      .send({ errandId: errand.id, amount: 400, receiptEvidenceId: photo.body.id })
      .expect(400);
    expect(noReceipt.body.code).toBe('receipt_required');
    const over = await http()
      .post(url)
      .set(bearer(runner.token))
      .send({ errandId: errand.id, amount: 600, receiptEvidenceId: receipt.body.id })
      .expect(400);
    expect(over.body).toMatchObject({ code: 'reimbursement_exceeds_cap', cap: '500.00', itemPaidToNitume: '500.00' });
    const claim = await http()
      .post(url)
      .set(bearer(runner.token))
      .send({ errandId: errand.id, amount: 400, receiptEvidenceId: receipt.body.id, note: 'Bought before the cancel' })
      .expect(201);
    expect(claim.body).toMatchObject({ kind: 'item_reimbursement', status: 'on_hold', amount: '400.00', reviewReason: 'out_of_pocket_claim' });
    expect((await linesOf(errand.id)).map((l) => l.kind)).toEqual(['item_reimbursement']);
    const twice = await http()
      .post(url)
      .set(bearer(runner.token))
      .send({ errandId: errand.id, amount: 400, receiptEvidenceId: receipt.body.id })
      .expect(409);
    expect(twice.body.code).toBe('reimbursement_already_recorded');
    const earnings = await http().get('/api/v1/runners/me/earnings').set(bearer(runner.token)).expect(200);
    expect(earnings.body).toMatchObject({ onHoldAmount: '400.00', availableAmount: '0.00' });
  });

  it('a runner may decline over max_purchase_advance; the task stays RUNNER_ASSIGNED and is reassigned (row 108)', async () => {
    const { admin, runner, errand } = await paidAndAssigned();
    const within = await http()
      .post(`/api/v1/errands/${errand.id}/assignment/decline`)
      .set(bearer(runner.token))
      .send({ reason: 'over_purchase_limit' })
      .expect(409);
    expect(within.body).toMatchObject({ code: 'purchase_within_limit', requiredPurchase: '500.00', maxPurchaseAdvance: '3000.00' });
    await db().query('UPDATE "runner_profiles" SET "maxPurchaseAdvance" = 100 WHERE id = $1', [runner.profileId]);
    const check = await http().get(`/api/v1/errands/${errand.id}/purchase-check`).set(bearer(runner.token)).expect(200);
    expect(check.body).toEqual({
      errandId: errand.id,
      runnerProfileId: runner.profileId,
      requiredPurchase: '500.00',
      maxPurchaseAdvance: '100.00',
      overLimit: true,
    });
    await http()
      .post(`/api/v1/errands/${errand.id}/assignment/decline`)
      .set(bearer(runner.token))
      .send({ reason: 'tired' })
      .expect(400);
    const declined = await http()
      .post(`/api/v1/errands/${errand.id}/assignment/decline`)
      .set(bearer(runner.token))
      .send({ reason: 'over_purchase_limit' })
      .expect(200);
    expect(declined.body).toMatchObject({ status: 'declined', declineReason: 'over_purchase_limit', overLimit: true });
    const [row] = await db().query('SELECT status FROM "errands" WHERE id = $1', [errand.id]);
    expect(row.status).toBe('RUNNER_ASSIGNED');
    await http().get(`/api/v1/errands/${errand.id}`).set(bearer(runner.token)).expect(403);

    const other = await makeUser(UserRole.RUNNER);
    const adminCheck = await http()
      .get(`/api/v1/errands/${errand.id}/purchase-check?runnerProfileId=${other.profileId}`)
      .set(bearer(admin.token))
      .expect(200);
    expect(adminCheck.body.overLimit).toBe(false);
    const reassigned = await http()
      .post(`/api/v1/errands/${errand.id}/assign`)
      .set(bearer(admin.token))
      .send({ runnerProfileId: other.profileId })
      .expect(201);
    expect(reassigned.body).toMatchObject({ history: null, assignment: { runnerProfileId: other.profileId, status: 'assigned' } });
    await http().get(`/api/v1/errands/${errand.id}`).set(bearer(other.token)).expect(200);
    await new Promise((r) => setTimeout(r, 300));
    const feed: unknown[] = await db().query(
      'SELECT 1 FROM "notifications" WHERE "userId" = $1 AND "eventType" = $2',
      [admin.id, 'assignment.declined'],
    );
    expect(feed.length).toBeGreaterThanOrEqual(1);
  });

  it('refunds and the runner item reimbursement share one cap; above it needs an audited override (row 136)', async () => {
    const { admin, runner, errand } = await paidAndAssigned();
    await setStatus(admin, errand.id, 'CANCELLED');
    const [review] = (await db().query('SELECT id FROM "refund_reviews" WHERE "errandId" = $1', [errand.id])) as { id: string }[];
    // The customer gets 700 of the 1000 paid back.
    await http().patch(`/api/v1/refunds/${review.id}/decision`).set(bearer(admin.token)).send({ refundAmount: 700 }).expect(200);
    const receipt = await upload(runner, errand.id);
    const claim = await http()
      .post('/api/v1/runners/me/reimbursement-claims')
      .set(bearer(runner.token))
      .send({ errandId: errand.id, amount: 500, receiptEvidenceId: receipt.body.id })
      .expect(201);
    const over = await http()
      .post(`/api/v1/runner-payouts/${claim.body.id}/review`)
      .set(bearer(admin.token))
      .send({ decision: 'approve', amount: 400 })
      .expect(409);
    expect(over.body).toMatchObject({
      code: 'task_exposure_cap_exceeded',
      totalPaidToNitume: '1000.00',
      committedRefunds: '700.00',
      remaining: '300.00',
    });
    await http()
      .post(`/api/v1/runner-payouts/${claim.body.id}/review`)
      .set(bearer(admin.token))
      .send({ decision: 'approve', amount: 400, exposureOverrideNote: 'short' })
      .expect(400);
    const ok = await http()
      .post(`/api/v1/runner-payouts/${claim.body.id}/review`)
      .set(bearer(admin.token))
      .send({ decision: 'approve', amount: 400, exposureOverrideNote: 'Refund went out before the receipt came in' })
      .expect(200);
    expect(ok.body).toMatchObject({
      status: 'payable',
      amount: '400.00',
      taskExposure: { totalPaidToNitume: '1000.00', committedRefunds: '700.00', committedReimbursements: '400.00', remaining: '0.00' },
      exposureOverrides: [
        expect.objectContaining({ source: 'runner_reimbursement', amount: '400.00', normalCap: '300.00', createdByUserId: admin.id }),
      ],
    });
    const refundDetail = await http().get(`/api/v1/refunds/${review.id}`).set(bearer(admin.token)).expect(200);
    expect(refundDetail.body.taskExposure).toMatchObject({ committedReimbursements: '400.00', remaining: '0.00' });
    expect(refundDetail.body.exposureOverrides).toHaveLength(1);
    await expect(db().query('DELETE FROM "task_exposure_overrides" WHERE "errandId" = $1', [errand.id])).rejects.toThrow(/append-only/);
  });

  /** Paid send_to_runner task in IN_PROGRESS with an approved, undecided decrease of 200 (item 500 -> 300). */
  const withPendingDecrease = async () => {
    const actors = await paidAndAssigned();
    const { customer, runner, errand } = actors;
    for (const to of ['RUNNER_EN_ROUTE', 'ARRIVED', 'IN_PROGRESS']) {
      await setStatus(runner, errand.id, to);
    }
    const req = await http()
      .post(`/api/v1/errands/${errand.id}/price-change`)
      .set(bearer(runner.token))
      .send({ toPrice: 300, reason: 'Cheaper at the shop' })
      .expect(201);
    const approved = await http()
      .post(`/api/v1/errands/${errand.id}/price-change/${req.body.id}/approve`)
      .set(bearer(customer.token))
      .send({})
      .expect(201);
    expect(approved.body.refundReview).toMatchObject({ amountPaid: '200.00', status: 'pending_review' });
    return { ...actors, decreaseId: approved.body.refundReview.id as string };
  };

  const confirmFromInProgress = async (customer: Actor, runner: Actor, errandId: string) => {
    await upload(runner, errandId);
    await setStatus(runner, errandId, 'AWAITING_CUSTOMER');
    await setStatus(customer, errandId, 'COMPLETED');
    await app
      .get(ErrandsService)
      .transition(errandId, ErrandStatus.CONFIRMED, { type: StatusHistoryActor.SYSTEM }, 'Dispute window passed');
  };

  const decideRefund = (admin: Actor, id: string, body: Record<string, unknown>, expected: number) =>
    http().patch(`/api/v1/refunds/${id}/decision`).set(bearer(admin.token)).send(body).expect(expected);

  const approveItem = (admin: Actor, id: string, body: Record<string, unknown>, expected: number) =>
    http()
      .post(`/api/v1/runner-payouts/${id}/review`)
      .set(bearer(admin.token))
      .send({ decision: 'approve', ...body })
      .expect(expected);

  it('a decrease still pending at CONFIRMED holds the item line; runner approved first, the decrease needs an override', async () => {
    const { customer, admin, runner, errand, decreaseId } = await withPendingDecrease();
    await confirmFromInProgress(customer, runner, errand.id);
    const [item, fee] = await linesOf(errand.id);
    expect(fee).toMatchObject({ kind: 'runner_fee', status: 'payable', amount: '300.00' });
    expect(item).toMatchObject({ kind: 'item_reimbursement', status: 'on_hold', amount: null, reviewReason: 'price_decrease_pending' });
    // Ops approve the full item before deciding the decrease...
    await approveItem(admin, item.id, { amount: 500 }, 200);
    // ...so the decrease would come out of Nitume's fees: refused (scope item).
    const refused = await decideRefund(admin, decreaseId, { refundAmount: 200 }, 409);
    expect(refused.body).toMatchObject({
      code: 'task_exposure_cap_exceeded',
      scope: 'item',
      totalPaidToNitume: '500.00',
      committedReimbursements: '500.00',
      remaining: '0.00',
    });
    await decideRefund(admin, decreaseId, { refundAmount: 200, exposureOverrideNote: 'Recovering the 200 from the runner' }, 200);
    const [override] = (await db().query('SELECT source, amount, "normalCap" FROM "task_exposure_overrides" WHERE "errandId" = $1', [
      errand.id,
    ])) as { source: string; amount: string; normalCap: string }[];
    expect(override).toEqual({ source: 'refund_decision', amount: '200.00', normalCap: '0.00' });
    // An override can only name its own errand (DB trigger).
    const other = await createErrand(customer);
    await expect(
      db().query(
        `INSERT INTO "task_exposure_overrides"
           ("errandId", source, "refundReviewId", amount, "normalCap", "totalPaidToNitume",
            "committedRefunds", "committedReimbursements", note, "createdByUserId")
         VALUES ($1, 'refund_decision', $2, 10, 0, 0, 0, 0, 'wrong task', $3)`,
        [other.id, decreaseId, admin.id],
      ),
    ).rejects.toThrow(/errandId must match/);
  });

  it('decrease decided first: the runner can only be approved for the reduced item amount', async () => {
    const { customer, admin, runner, errand, decreaseId } = await withPendingDecrease();
    await confirmFromInProgress(customer, runner, errand.id);
    const [item] = await linesOf(errand.id);
    await decideRefund(admin, decreaseId, { refundAmount: 200 }, 200);
    const over = await approveItem(admin, item.id, { amount: 500 }, 400);
    expect(over.body).toMatchObject({ code: 'reimbursement_exceeds_cap', cap: '300.00', itemPaidToNitume: '300.00' });
    await approveItem(admin, item.id, { amount: 300 }, 200);
    // Out: refund 200 + item 300 + runner fee 300 = 800 of the 1000 paid; the service fee stays with Nitume.
    const lines = await linesOf(errand.id);
    expect(lines.map((l) => [l.kind, l.amount])).toEqual([
      ['item_reimbursement', '300.00'],
      ['runner_fee', '300.00'],
    ]);
  });

  it('CANCELLED with a pending decrease: an approved claim blocks the decrease without an override', async () => {
    const { customer, admin, runner, errand, decreaseId } = await withPendingDecrease();
    const second = await http()
      .post(`/api/v1/errands/${errand.id}/price-change`)
      .set(bearer(runner.token))
      .send({ toPrice: 900, reason: 'Out of stock, bigger pack' })
      .expect(201);
    await http()
      .post(`/api/v1/errands/${errand.id}/price-change/${second.body.id}/reject`)
      .set(bearer(customer.token))
      .send({})
      .expect(201);
    const receipt = await upload(runner, errand.id);
    const claim = await http()
      .post('/api/v1/runners/me/reimbursement-claims')
      .set(bearer(runner.token))
      .send({ errandId: errand.id, amount: 500, receiptEvidenceId: receipt.body.id })
      .expect(201);
    await approveItem(admin, claim.body.id, { amount: 500 }, 200);
    const refused = await decideRefund(admin, decreaseId, { refundAmount: 200 }, 409);
    expect(refused.body).toMatchObject({ code: 'task_exposure_cap_exceeded', scope: 'item' });
  });

  it('refund corrections cannot be truncated (reviewer follow-up)', async () => {
    await expect(db().query('TRUNCATE "refund_payout_corrections"')).rejects.toThrow(/append-only/);
    await expect(db().query('TRUNCATE "runner_payout_lines" CASCADE')).rejects.toThrow(/append-only/);
    await expect(db().query('TRUNCATE "task_exposure_overrides"')).rejects.toThrow(/append-only/);
  });
});
