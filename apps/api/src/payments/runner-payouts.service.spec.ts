import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FindOperator } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../common/api-error';
import { ErrandCategory, ErrandStatus, EvidenceType } from '../common/enums';
import { ReferenceUse, runnerReferenceConflict } from './payout-references';
import {
  RunnerPayoutLine,
  RunnerPayoutLineStatus as S,
  RunnerPayoutLineType as T,
  RunnerPayoutReviewReason as R,
} from './runner-payout-line.entity';
import {
  RunnerPayoutsService,
  approvalCeilingOf,
  overLimitCeilingOf,
  purchaseLimitOf,
  payoutFeedOf,
  earningsRangeOf,
  earningsSummaryOf,
  effectiveRunnerPayoutOf,
  linePositionOf,
} from './runner-payouts.service';

const PAID_AT = new Date('2026-10-10T08:00:00Z');

const line = (over: Partial<RunnerPayoutLine> = {}): RunnerPayoutLine =>
  Object.assign(new RunnerPayoutLine(), {
    id: 'l-1',
    runnerProfileId: 'rp-1',
    errandId: 'e-1',
    kind: T.RUNNER_FEE,
    status: S.PAYABLE,
    requestedAmount: '300.00',
    amount: '300.00',
    capAmount: null,
    purchaseLimitAtCreation: null,
    reviewReason: null,
    receiptEvidenceId: null,
    relatedLineId: null,
    previousReference: null,
    previousAmount: null,
    payoutReference: null,
    paidAt: null,
    paidByUserId: null,
    note: null,
    decisionNote: null,
    decidedByUserId: null,
    decidedAt: null,
    createdByUserId: null,
    createdAt: new Date('2026-10-09T08:00:00Z'),
    ...over,
  });

const adj = (kind: T, over: Partial<RunnerPayoutLine> = {}) =>
  line({ kind, status: S.RECORDED, relatedLineId: 'l-1', amount: null, requestedAmount: null, ...over });

const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => (e instanceof ApiError ? e.code : String(e)),
  );

/** Matches a TypeORM `where` object against a row (equality and In()). */
const matches = (row: Record<string, unknown>, where: Record<string, unknown> = {}): boolean =>
  Object.entries(where).every(([k, v]) =>
    v instanceof FindOperator ? (v.value as unknown[]).includes(row[k]) : row[k] === v,
  );

/**
 * In-memory runner_payout_lines with the database rules that matter here:
 * one obligation per errand and type (ON CONFLICT DO NOTHING), and the
 * trigger's final states.
 */
const build = (
  opts: { feePaid?: number; itemPaid?: number; receipts?: object[]; maxPurchaseAdvance?: string; totalPaid?: number } = {},
) => {
  const table: RunnerPayoutLine[] = [];
  let seq = 0;
  const nextId = () => `l-${(seq += 1)}`;
  const tick = () => new Date(Date.UTC(2026, 9, 11, 0, seq));
  const repo = {
    findOne: vi.fn(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(table.find((r) => matches(r as never, where)) ?? null),
    ),
    find: vi.fn(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(table.filter((r) => matches(r as never, where))),
    ),
    update: vi.fn((id: string, patch: Partial<RunnerPayoutLine>) => {
      const row = table.find((r) => r.id === id)!;
      if (row.status === S.PAID || row.status === S.REJECTED || row.status === S.RECORDED) {
        return Promise.reject(new Error(`runner_payout_lines: a ${row.status} line is final`));
      }
      Object.assign(row, patch);
      return Promise.resolve({ affected: 1 });
    }),
    insert: vi.fn((v: Partial<RunnerPayoutLine>) => {
      table.push(line({ ...v, id: nextId(), createdAt: tick() } as Partial<RunnerPayoutLine>));
      return Promise.resolve({});
    }),
  };
  /** Uses recorded outside runner_payout_lines (refunds), by receipt. */
  const uses = new Map<string, ReferenceUse[]>();
  const query = vi.fn((sql: string, params: unknown[]) => {
    if (sql.includes('INSERT INTO "runner_payout_lines"')) {
      const [runnerProfileId, errandId, kind, status, requestedAmount, amount, capAmount, reviewReason, receiptEvidenceId, note, createdByUserId, purchaseLimitAtCreation] =
        params as string[];
      if (table.some((r) => r.errandId === errandId && r.kind === kind)) {
        return Promise.resolve([]);
      }
      const id = nextId();
      table.push(
        line({
          id,
          runnerProfileId,
          errandId,
          kind: kind as T,
          status: status as S,
          requestedAmount,
          amount,
          capAmount,
          reviewReason: reviewReason as R,
          receiptEvidenceId,
          note,
          createdByUserId,
          purchaseLimitAtCreation: purchaseLimitAtCreation ?? null,
          createdAt: tick(),
        }),
      );
      return Promise.resolve([{ id }]);
    }
    if (sql.includes('UNION ALL')) {
      const ref = params[0] as string;
      const fromLines: ReferenceUse[] = table
        .filter((r) => r.payoutReference?.toUpperCase() === ref)
        .map((r) => ({
          source: 'runner',
          runnerProfileId: r.runnerProfileId,
          lineId: r.id,
          obligationId: r.relatedLineId ?? r.id,
          kind: r.kind,
        }));
      return Promise.resolve([...(uses.get(ref) ?? []), ...fromLines]);
    }
    if (sql.includes('SUM("amount")')) {
      const [errandId, exclude] = params as (string | null)[];
      const total = table
        .filter(
          (r) =>
            r.errandId === errandId &&
            r.kind === T.ITEM_REIMBURSEMENT &&
            (r.status === S.PAYABLE || r.status === S.PAID) &&
            r.id !== exclude,
        )
        .reduce((t, r) => t + Number(r.amount), 0);
      return Promise.resolve([{ total: total.toFixed(2) }]);
    }
    return Promise.resolve([]);
  });
  const overrides: object[] = [];
  const overrideRepo = {
    find: vi.fn(() => Promise.resolve(overrides.filter((o) => (o as { source?: string }).source !== 'purchase_limit'))),
    findOne: vi.fn(({ where }: { where: { runnerPayoutLineId: string } }) =>
      Promise.resolve(
        (overrides as { source?: string; runnerPayoutLineId?: string }[])
          .filter((o) => o.source === 'purchase_limit' && o.runnerPayoutLineId === where.runnerPayoutLineId)
          .pop() ?? null,
      ),
    ),
    create: vi.fn((o: object) => o),
    save: vi.fn((o: object) => {
      overrides.push(o);
      return Promise.resolve(o);
    }),
  };
  const manager = {
    query,
    getRepository: (entity: { name: string }) => (entity.name === 'TaskExposureOverride' ? overrideRepo : repo),
  };
  const lines = { ...repo, manager: { query, getRepository: manager.getRepository, transaction: vi.fn((fn: (m: unknown) => unknown) => fn(manager)) } };
  const errands = {
    onConfirmed: vi.fn(),
    listFor: vi.fn(() => Promise.resolve({ items: [{ id: 'e-7' }, { id: 'e-8' }], nextCursor: null })),
    activeAssignmentFor: vi.fn(() => Promise.resolve({ runnerProfileId: 'rp-1' })),
    assertReceiptWindowOpen: vi.fn(() => Promise.resolve()),
    latestAssignmentOf: vi.fn(() => Promise.resolve({ id: 'as-1', runnerProfileId: 'rp-1' })),
    getById: vi.fn(() => Promise.resolve({ id: 'e-1', status: ErrandStatus.CANCELLED })),
    findByIds: vi.fn(() =>
      Promise.resolve([
        { id: 'e-1', reference: 'NT-1', title: null, category: ErrandCategory.BUY_FOR_ME, status: ErrandStatus.CONFIRMED },
      ]),
    ),
  };
  const runnerProfile = { id: 'rp-1', userId: 'u-run', maxPurchaseAdvance: opts.maxPurchaseAdvance ?? '3000.00' };
  const runners = {
    profileById: vi.fn(() => Promise.resolve(runnerProfile)),
    profileByUserId: vi.fn(() => Promise.resolve(runnerProfile)),
    publicSummaries: vi.fn(() =>
      Promise.resolve(new Map([['rp-1', { id: 'rp-1', displayName: 'Kevin Otieno', shortName: 'Kevin O.' }]])),
    ),
  };
  const evidence = {
    receiptsFor: vi.fn(() => Promise.resolve(opts.receipts ?? [{ id: 'ev-1' }])),
    findById: vi.fn((id: string) =>
      Promise.resolve(
        id === 'ev-1'
          ? { id: 'ev-1', errandId: 'e-1', type: EvidenceType.RECEIPT, uploadedBy: 'u-run' }
          : id === 'ev-photo'
            ? { id: 'ev-photo', errandId: 'e-1', type: EvidenceType.PHOTO, uploadedBy: 'u-run' }
            : null,
      ),
    ),
  };
  const users = {
    displayNames: vi.fn(() => Promise.resolve(new Map([['admin-1', 'Finance']]))),
    findById: vi.fn(() => Promise.resolve({ id: 'u-run', displayName: 'Kevin Otieno', phone: '+254700000001' })),
  };
  /** Paid to Nitume (fees + item) and committed customer refunds on the task (row 136). */
  const refunds = {
    committedRefundTotal: vi.fn(() => Promise.resolve(0)),
    hasPendingDecrease: vi.fn(() => Promise.resolve(false)),
    totalPaidToNitume: vi.fn(() => Promise.resolve(opts.totalPaid ?? 10_000)),
  };
  const service = new RunnerPayoutsService(
    lines as never,
    {} as never,
    errands as never,
    runners as never,
    evidence as never,
    refunds as never,
    users as never,
  );
  vi.spyOn(service, 'runnerFeePaid').mockResolvedValue(opts.feePaid ?? 300);
  vi.spyOn(service, 'itemPaidToNitume').mockResolvedValue(opts.itemPaid ?? 0);
  return { service, table, errands, evidence, runners, query, uses, manager, repo, refunds, overrides };
};

describe('effective payout and position of a runner line', () => {
  it('applies corrections, reversals and re-sent payouts in order; reversed is owed again', () => {
    const paid = line({ status: S.PAID, payoutReference: 'QAB1', paidAt: PAID_AT });
    expect(effectiveRunnerPayoutOf(line())).toBeNull();
    expect(effectiveRunnerPayoutOf(paid)).toEqual({ state: 'sent', amount: '300.00', reference: 'QAB1', at: PAID_AT });
    const t1 = new Date('2026-10-11T01:00:00Z');
    const t2 = new Date('2026-10-11T02:00:00Z');
    const steps = [
      adj(T.CORRECTION, { amount: '250.00', createdAt: t1 }),
      adj(T.REVERSAL, { payoutReference: 'REV1', createdAt: t2 }),
    ];
    // Corrected to a lower amount actually sent: the difference stays owed.
    expect(linePositionOf(paid, steps.slice(0, 1))).toMatchObject({ status: S.PAID, paid: 250, available: 50 });
    expect(linePositionOf(paid, steps)).toMatchObject({ status: S.PAYABLE, paid: 0, available: 300 });
    const resent = [...steps, adj(T.RESENT_PAYOUT, { payoutReference: 'QEF2', amount: '300.00', createdAt: t2 })];
    expect(linePositionOf(paid, resent)).toMatchObject({
      status: S.PAID,
      paid: 300,
      payout: { state: 'sent', reference: 'QEF2' },
    });
    expect(linePositionOf(line({ status: S.ON_HOLD, amount: null, requestedAmount: '500.00' }))).toMatchObject({
      status: S.ON_HOLD,
      onHold: 500,
      available: 0,
    });
    expect(linePositionOf(line({ status: S.REJECTED, amount: null }))).toMatchObject({ onHold: 0, available: 0, paid: 0 });
  });
});

describe('earnings summary (derived, never stored)', () => {
  it('splits balance by type and buckets earnings and payouts by EAT day', () => {
    const rows = [
      // Fee confirmed 2026-10-09 21:30 UTC = 2026-10-10 00:30 EAT; paid 10-10.
      { line: line({ createdAt: new Date('2026-10-09T21:30:00Z'), status: S.PAID, payoutReference: 'Q1', paidAt: PAID_AT }), adjustments: [] },
      { line: line({ id: 'l-2', kind: T.ITEM_REIMBURSEMENT, amount: '1000.00', requestedAmount: '1000.00', createdAt: new Date('2026-10-11T09:00:00Z') }), adjustments: [] },
      { line: line({ id: 'l-3', kind: T.ITEM_REIMBURSEMENT, status: S.ON_HOLD, amount: null, requestedAmount: '400.00' }), adjustments: [] },
      { line: line({ id: 'l-4', status: S.REJECTED, amount: null }), adjustments: [] },
    ];
    const now = new Date('2026-10-11T12:00:00Z');
    const out = earningsSummaryOf(rows, earningsRangeOf({ from: '2026-10-09', to: '2026-10-11' }), 2450, now);
    expect(out).toMatchObject({
      currency: 'KES',
      availableAmount: '1000.00',
      pendingAmount: '2450.00',
      onHoldAmount: '400.00',
      paidAmount: '300.00',
    });
    expect(out.byKind.runnerFee).toEqual({ availableAmount: '0.00', onHoldAmount: '0.00', paidAmount: '300.00' });
    expect(out.byKind.itemReimbursement).toEqual({ availableAmount: '1000.00', onHoldAmount: '400.00', paidAmount: '0.00' });
    expect(out.period.buckets).toEqual([
      { start: '2026-10-09', runnerFeeAmount: '0.00', itemReimbursementAmount: '0.00', paidOutAmount: '0.00' },
      { start: '2026-10-10', runnerFeeAmount: '300.00', itemReimbursementAmount: '0.00', paidOutAmount: '300.00' },
      { start: '2026-10-11', runnerFeeAmount: '0.00', itemReimbursementAmount: '1000.00', paidOutAmount: '0.00' },
    ]);
    expect(out.period.totals).toEqual({ runnerFeeAmount: '300.00', itemReimbursementAmount: '1000.00', paidOutAmount: '300.00' });
    // Chart: Mon 2026-10-05 .. Sun 2026-10-11, runner fees only.
    expect(out.week.map((d) => d.day)).toEqual([
      '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11',
    ]);
    expect(out.week[5]).toEqual({ day: '2026-10-10', runnerFeeAmount: '300.00' });
    expect(out.weekTotal).toBe('300.00');

    const weekly = earningsSummaryOf(rows, earningsRangeOf({ from: '2026-10-01', to: '2026-10-13', groupBy: 'week' }));
    expect(weekly.period.buckets.map((b) => b.start)).toEqual(['2026-09-28', '2026-10-05', '2026-10-12']);
    expect(weekly.period.buckets[1]).toMatchObject({ runnerFeeAmount: '300.00', itemReimbursementAmount: '1000.00' });
  });

  it('defaults to the last 7 EAT days by day and refuses bad ranges', () => {
    // 2026-10-13 22:00 UTC is already 2026-10-14 in Nairobi.
    expect(earningsRangeOf({}, new Date('2026-10-13T22:00:00Z'))).toEqual({
      from: '2026-10-08',
      to: '2026-10-14',
      groupBy: 'day',
    });
    for (const bad of [{ from: '2026-10-12', to: '2026-10-11' }, { from: '2025-01-01', to: '2026-10-11' }, { from: '2026-13-40' }]) {
      expect(() => earningsRangeOf(bad)).toThrow(expect.objectContaining({ code: 'earnings_range_invalid' }) as Error);
    }
  });
});

describe('runner payout receipts (batched payouts, no reuse across payouts)', () => {
  const use = (over: Partial<ReferenceUse>): ReferenceUse => ({
    source: 'runner',
    runnerProfileId: 'rp-1',
    lineId: 'x',
    obligationId: 'x',
    kind: 'runner_fee',
    ...over,
  });
  const target = { runnerProfileId: 'rp-1', obligationIds: ['l-1'], isReversal: false };
  it('allows one receipt across lines of the same runner only', () => {
    expect(runnerReferenceConflict([], target)).toBe(false);
    expect(runnerReferenceConflict([use({})], target)).toBe(false);
    expect(runnerReferenceConflict([use({ runnerProfileId: 'rp-2' })], target)).toBe(true);
    expect(runnerReferenceConflict([use({ source: 'refund', runnerProfileId: null })], target)).toBe(true);
    expect(runnerReferenceConflict([use({ kind: 'reversal' })], target)).toBe(true);
    expect(runnerReferenceConflict([use({ obligationId: 'l-1' })], target)).toBe(true);
    expect(runnerReferenceConflict([use({})], { ...target, isReversal: true })).toBe(true);
  });
});

describe('RunnerPayoutsService.recordConfirmed (rows 95, 104, 105, 108)', () => {
  it('registers on CONFIRMED only', () => {
    const { service, errands } = build();
    service.onModuleInit();
    expect(errands.onConfirmed).toHaveBeenCalledTimes(1);
  });

  it('creates a payable runner fee and a payable item reimbursement with a receipt, once', async () => {
    const { service, table, manager, errands, runners, evidence } = build({ feePaid: 300, itemPaid: 1000 });
    await service.recordConfirmed(manager as never, 'e-1');
    // Every read happens inside the confirming transaction.
    expect(errands.activeAssignmentFor).toHaveBeenCalledWith('e-1', manager);
    expect(runners.profileById).toHaveBeenCalledWith('rp-1', manager);
    expect(evidence.receiptsFor).toHaveBeenCalledWith('e-1', 'u-run', manager);
    expect(table).toEqual([
      expect.objectContaining({ kind: T.RUNNER_FEE, status: S.PAYABLE, amount: '300.00', runnerProfileId: 'rp-1' }),
      expect.objectContaining({
        kind: T.ITEM_REIMBURSEMENT,
        status: S.PAYABLE,
        amount: '1000.00',
        capAmount: '1000.00',
        receiptEvidenceId: 'ev-1',
        reviewReason: null,
      }),
    ]);
    // Idempotent: a retried job creates nothing.
    await expect(service.recordConfirmed(manager as never, 'e-1')).resolves.toEqual([]);
    expect(table).toHaveLength(2);
  });

  it('sends the item line to ops review without a receipt (row 105); the fee is unaffected', async () => {
    const { service, table, manager } = build({ itemPaid: 1000, receipts: [] });
    await service.recordConfirmed(manager as never, 'e-1');
    expect(table[0]).toMatchObject({ kind: T.RUNNER_FEE, status: S.PAYABLE });
    expect(table[1]).toMatchObject({
      status: S.ON_HOLD,
      amount: null,
      requestedAmount: '1000.00',
      reviewReason: R.RECEIPT_MISSING,
    });
  });

  it('sends a purchase above max_purchase_advance to ops review (row 108)', async () => {
    const { service, table, manager } = build({ itemPaid: 3500, maxPurchaseAdvance: '3000.00' });
    await service.recordConfirmed(manager as never, 'e-1');
    expect(table[1]).toMatchObject({ status: S.ON_HOLD, reviewReason: R.OVER_PURCHASE_LIMIT });
  });

  it('creates no item line when nothing was paid to Nitume for the item (merchant_direct)', async () => {
    const { service, table, manager } = build({ itemPaid: 0 });
    await service.recordConfirmed(manager as never, 'e-1');
    expect(table.map((r) => r.kind)).toEqual([T.RUNNER_FEE]);
  });

  it('row 95 still holds: lines are only created through the CONFIRMED hook', () => {
    const source = readFileSync(join(__dirname, 'runner-payouts.service.ts'), 'utf-8');
    const insertCalls = source.match(/this\.insertObligation\(/g) ?? [];
    // recordConfirmed (fee + item) and claim (CANCELLED/FAILED, always in review).
    expect(insertCalls).toHaveLength(3);
    expect(source).toMatch(/status: S\.ON_HOLD,\s+requestedAmount: input\.amount/);
  });
});

describe('RunnerPayoutsService.claim (row 106)', () => {
  const claim = { errandId: 'e-1', amount: 800, receiptEvidenceId: 'ev-1' };

  it('records a claim on a CANCELLED or FAILED task, always in review, never a runner fee', async () => {
    for (const status of [ErrandStatus.CANCELLED, ErrandStatus.FAILED]) {
      const { service, table, errands } = build({ itemPaid: 1000 });
      errands.getById.mockResolvedValue({ id: 'e-1', status });
      const view = await service.claim('u-run', { ...claim, note: ' bought it ' });
      expect(table).toEqual([
        expect.objectContaining({
          kind: T.ITEM_REIMBURSEMENT,
          status: S.ON_HOLD,
          requestedAmount: '800.00',
          capAmount: '1000.00',
          reviewReason: R.OUT_OF_POCKET_CLAIM,
          receiptEvidenceId: 'ev-1',
          createdByUserId: 'u-run',
          note: 'bought it',
        }),
      ]);
      expect(view).toMatchObject({
        kind: T.ITEM_REIMBURSEMENT,
        status: S.ON_HOLD,
        amount: '800.00',
        reviewReason: R.OUT_OF_POCKET_CLAIM,
        payableAt: null,
      });
      expect(JSON.stringify(view)).not.toContain('bought it');
    }
  });

  it('refuses claims with the documented codes', async () => {
    const other = build({ itemPaid: 1000 });
    other.errands.getById.mockResolvedValue({ id: 'e-1', status: ErrandStatus.COMPLETED });
    expect(await codeOf(other.service.claim('u-run', claim))).toBe('reimbursement_claim_not_allowed');

    const expired = build({ itemPaid: 1000 });
    expired.errands.getById.mockResolvedValue({ id: 'e-1', status: ErrandStatus.EXPIRED });
    expect(await codeOf(expired.service.claim('u-run', claim))).toBe('reimbursement_claim_not_allowed');

    const notRunner = build({ itemPaid: 1000 });
    notRunner.errands.activeAssignmentFor.mockResolvedValue({ runnerProfileId: 'rp-2' });
    expect(await codeOf(notRunner.service.claim('u-run', claim))).toMatch(/not the runner/);

    expect(await codeOf(build({ itemPaid: 1000 }).service.claim('u-run', { ...claim, receiptEvidenceId: 'ev-photo' }))).toBe(
      'receipt_required',
    );
    expect(await codeOf(build({ itemPaid: 0 }).service.claim('u-run', claim))).toBe('no_item_amount_paid');

    const limit = build({ itemPaid: 1000, maxPurchaseAdvance: '500.00' });
    const capped = await limit.service.claim('u-run', { ...claim, amount: 500.01 }).catch((e: unknown) => e);
    expect((capped as ApiError).getResponse()).toMatchObject({
      code: 'reimbursement_exceeds_cap',
      cap: '500.00',
      itemPaidToNitume: '1000.00',
      maxPurchaseAdvance: '500.00',
    });

    const over = build({ itemPaid: 1000 });
    const err = await over.service.claim('u-run', { ...claim, amount: 1000.01 }).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'reimbursement_exceeds_cap' });
    expect((err as ApiError).getResponse()).toMatchObject({ cap: '1000.00' });

    // Row 129 (RA-12): after the 24 h window the claim is refused.
    const late = build({ itemPaid: 1000 });
    late.errands.assertReceiptWindowOpen.mockRejectedValue(new ApiError(409, 'reimbursement_window_closed', 'closed'));
    expect(await codeOf(late.service.claim('u-run', claim))).toBe('reimbursement_window_closed');
    expect(late.table).toHaveLength(0);

    const twice = build({ itemPaid: 1000 });
    await twice.service.claim('u-run', claim);
    expect(await codeOf(twice.service.claim('u-run', claim))).toBe('reimbursement_already_recorded');
    expect(twice.table).toHaveLength(1);
  });
});

describe('RunnerPayoutsService ops review (rows 105, 106)', () => {
  const inReview = async (itemPaid = 1000, requested = 800) => {
    const b = build({ itemPaid });
    await b.service.claim('u-run', { errandId: 'e-1', amount: requested, receiptEvidenceId: 'ev-1' });
    return b;
  };

  it('approves up to min(requested, item paid to Nitume); above is 400 reimbursement_exceeds_cap', async () => {
    const { service, table } = await inReview(1000, 800);
    const err = await service.review('l-1', { decision: 'approve', amount: 800.01 }, 'admin-1').catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'reimbursement_exceeds_cap' });
    expect((err as ApiError).getStatus()).toBe(400);
    expect((err as ApiError).getResponse()).toMatchObject({
      cap: '800.00',
      requestedAmount: '800.00',
      itemPaidToNitume: '1000.00',
    });
    const out = await service.review('l-1', { decision: 'approve', amount: 750 }, 'admin-1');
    expect(table[0]).toMatchObject({ status: S.PAYABLE, amount: '750.00', decidedByUserId: 'admin-1' });
    expect(out).toMatchObject({ effectiveStatus: S.PAYABLE, decidedBy: { id: 'admin-1', displayName: 'Finance' } });
  });

  it('also respects the cap stored on the line when it was created', async () => {
    expect(approvalCeilingOf({ requestedAmount: '800.00', capAmount: '600.00' }, 1000)).toBe(600);
    expect(approvalCeilingOf({ requestedAmount: '800.00', capAmount: null }, 1000)).toBe(800);
    expect(approvalCeilingOf({ requestedAmount: '800.00', capAmount: '900.00' }, -5)).toBe(0);
    expect(approvalCeilingOf({ requestedAmount: '800.00', capAmount: '900.00' }, 1000, '500.00')).toBe(500);
    const b = await inReview(1000, 800);
    b.table[0].capAmount = '700.00';
    const err = await b.service.review('l-1', { decision: 'approve', amount: 700.01 }, 'a').catch((e: unknown) => e);
    expect((err as ApiError).getResponse()).toMatchObject({ code: 'reimbursement_exceeds_cap', cap: '700.00', capAmount: '700.00' });
    await b.service.review('l-1', { decision: 'approve', amount: 700 }, 'a');
    expect(b.table[0].amount).toBe('700.00');
  });

  it('caps at the item amount actually paid when it fell below the claim', async () => {
    const b = await inReview(1000, 1000);
    vi.spyOn(b.service, 'itemPaidToNitume').mockResolvedValue(600);
    expect(await codeOf(b.service.review('l-1', { decision: 'approve', amount: 600.01 }, 'a'))).toBe(
      'reimbursement_exceeds_cap',
    );
    await b.service.review('l-1', { decision: 'approve', amount: 600 }, 'a');
    expect(b.table[0].amount).toBe('600.00');
  });

  it('rejects with a note; a decided line cannot be decided again', async () => {
    const { service, table } = await inReview();
    expect(await codeOf(service.review('l-1', { decision: 'reject', note: 'no' }, 'a'))).toBe('decision_note_required');
    await service.review('l-1', { decision: 'reject', note: 'Receipt is for another shop' }, 'a');
    expect(table[0]).toMatchObject({ status: S.REJECTED, amount: null, decisionNote: 'Receipt is for another shop' });
    expect(await codeOf(service.review('l-1', { decision: 'approve', amount: 1 }, 'a'))).toBe('runner_payout_not_in_review');
  });

  it('a runner fee never goes through review; ops can hold an unpaid item line (receipt mismatch)', async () => {
    const { service, table, manager } = build({ itemPaid: 1000 });
    await service.recordConfirmed(manager as never, 'e-1');
    expect(await codeOf(service.review('l-1', { decision: 'approve', amount: 1 }, 'a'))).toBe('runner_payout_not_in_review');
    expect(await codeOf(service.hold('l-1', 'Wrong shop', 'a'))).toBe('runner_payout_not_holdable');
    await service.hold('l-2', 'Receipt total is KSh 600', 'a');
    expect(table[1]).toMatchObject({ status: S.ON_HOLD, amount: null, reviewReason: R.RECEIPT_MISMATCH });
    expect(await codeOf(service.markPaid(['l-2'], 'QAB1', 'a'))).toBe('runner_payout_not_payable');
  });
});

describe('RunnerPayoutsService payouts and corrections (row 107)', () => {
  const confirmed = async () => {
    const b = build({ feePaid: 300, itemPaid: 1000 });
    await b.service.recordConfirmed(b.manager as never, 'e-1');
    return b;
  };
  const reason = 'Typed the wrong receipt';

  it('one M-Pesa payout covers several lines of one runner; the receipt then locks them', async () => {
    const { service, table, query } = await confirmed();
    const out = await service.markPaid(['l-2', 'l-1'], ' qab123 ', 'admin-1');
    expect(table.map((r) => [r.status, r.payoutReference])).toEqual([
      [S.PAID, 'QAB123'],
      [S.PAID, 'QAB123'],
    ]);
    expect(out.items.every((i) => i.effectiveStatus === S.PAID)).toBe(true);
    const lockAt = query.mock.calls.findIndex(([sql]) => String(sql).includes('pg_advisory_xact_lock'));
    const checkAt = query.mock.calls.findIndex(([sql]) => String(sql).includes('UNION ALL'));
    expect(lockAt).toBeGreaterThanOrEqual(0);
    expect(checkAt).toBeGreaterThan(lockAt);
    expect(await codeOf(service.markPaid(['l-1'], 'QZZ999', 'admin-1'))).toBe('runner_payout_locked');
  });

  it('refuses a receipt used on a refund or another runner, and mixed runners', async () => {
    const { service, uses, table } = await confirmed();
    uses.set('QREF1', [{ source: 'refund', runnerProfileId: null, lineId: null, obligationId: null, kind: null }]);
    expect(await codeOf(service.markPaid(['l-1'], 'QREF1', 'a'))).toBe('payout_reference_reused');
    table[1].runnerProfileId = 'rp-2';
    expect(await codeOf(service.markPaid(['l-1', 'l-2'], 'QAB9', 'a'))).toBe('runner_payout_mixed_runners');
    expect(table.every((r) => r.status === S.PAYABLE)).toBe(true);
  });

  it('corrections, reversal and resend mirror refund corrections and never touch the paid line', async () => {
    const { service, table } = await confirmed();
    await service.markPaid(['l-1'], 'QAB1', 'admin-1');
    const columns = (r: RunnerPayoutLine) => ({
      status: r.status,
      amount: r.amount,
      payoutReference: r.payoutReference,
      paidAt: r.paidAt,
      paidByUserId: r.paidByUserId,
    });
    const original = columns(table[0]);
    const add = (input: Record<string, unknown>) =>
      service.addCorrection(
        'l-1',
        {
          reason,
          expectedLatestCorrectionId: table.filter((r) => r.relatedLineId === 'l-1').at(-1)?.id ?? null,
          ...input,
        } as never,
        'admin-1',
      );
    expect(await codeOf(add({ kind: T.CORRECTION, newReference: 'qab1' }))).toBe('correction_no_change');
    expect(await codeOf(add({ kind: T.CORRECTION, newAmount: 300.01 }))).toBe('runner_payout_exceeds_amount');
    expect(await codeOf(add({ kind: T.RESENT_PAYOUT, newReference: 'QX1', newAmount: 300 }))).toBe('payout_correction_kind_invalid');
    expect(await codeOf(add({ kind: T.REVERSAL }))).toBe('payout_reference_required');
    expect(await codeOf(add({ kind: T.REVERSAL, newReference: 'REV1', newAmount: 1 }))).toBe('payout_amount_not_allowed');
    expect(await codeOf(add({ kind: T.CORRECTION, newReference: 'QCD2', reason: 'abc' }))).toBe('correction_reason_invalid');

    const corrected = await add({ kind: T.CORRECTION, newReference: 'qcd2' });
    expect(corrected.effectivePayout).toMatchObject({ state: 'sent', reference: 'QCD2', amount: '300.00' });
    const reversed = await add({ kind: T.REVERSAL, newReference: 'REV1' });
    expect(reversed).toMatchObject({ effectiveStatus: S.PAYABLE, effectivePayout: { state: 'reversed', amount: '0.00' } });
    expect(await codeOf(add({ kind: T.RESENT_PAYOUT, newReference: 'REV1', newAmount: 300 }))).toBe('payout_reference_reused');
    expect(await codeOf(add({ kind: T.RESENT_PAYOUT, newReference: 'QAB1', newAmount: 300 }))).toBe('payout_reference_reused');
    expect(await codeOf(add({ kind: T.RESENT_PAYOUT, newReference: 'QEF3' }))).toBe('payout_amount_required');
    const resent = await add({ kind: T.RESENT_PAYOUT, newReference: 'QEF3', newAmount: 300 });
    expect(resent).toMatchObject({ effectiveStatus: S.PAID, effectivePayout: { state: 'sent', reference: 'QEF3' } });
    expect(resent.corrections.map((c) => [c.kind, c.previousReference, c.previousAmount, c.newReference])).toEqual([
      [T.CORRECTION, 'QAB1', '300.00', 'QCD2'],
      [T.REVERSAL, 'QCD2', '300.00', 'REV1'],
      [T.RESENT_PAYOUT, null, '0.00', 'QEF3'],
    ]);
    expect(resent.correctionCeiling).toBe('300.00');
    // The paid line itself never changed.
    expect(columns(table[0])).toEqual(original);

    const stale = await service
      .addCorrection('l-1', { kind: T.CORRECTION, newReference: 'QGH4', reason, expectedLatestCorrectionId: null }, 'a')
      .catch((e: unknown) => e);
    expect(stale).toMatchObject({ code: 'payout_correction_conflict' });
  });

  it('only a paid line takes corrections', async () => {
    const { service } = await confirmed();
    expect(
      await codeOf(
        service.addCorrection('l-1', { kind: T.REVERSAL, newReference: 'REV1', reason, expectedLatestCorrectionId: null }, 'a'),
      ),
    ).toBe('runner_payout_not_paid');
  });
});

describe('runner payout feed (RA-14, RA-16)', () => {
  const errands = new Map([
    ['e-1', { reference: 'NT-1', title: 'Grocery run' }],
    ['e-2', { reference: 'NT-2', title: null }],
  ]);
  const sum = (items: { amount: string; status: string }[]) =>
    items.filter((i) => i.status !== S.ON_HOLD && i.status !== S.REJECTED).reduce((t, i) => t + Number(i.amount), 0);

  it('derives one payout entry per M-Pesa payout; signed amounts add up to the available amount', () => {
    const at = new Date('2026-10-12T07:03:00Z');
    const fee = line({ status: S.PAID, payoutReference: 'SLK1', paidAt: at });
    const item = line({ id: 'l-2', errandId: 'e-2', kind: T.ITEM_REIMBURSEMENT, amount: '720.00', requestedAmount: '720.00', status: S.PAID, payoutReference: 'SLK1', paidAt: at, decidedAt: new Date('2026-10-11T00:00:00Z') });
    const held = line({ id: 'l-3', kind: T.ITEM_REIMBURSEMENT, errandId: 'e-1', status: S.ON_HOLD, amount: null, requestedAmount: '400.00', reviewReason: R.RECEIPT_MISSING });
    const feed = payoutFeedOf(
      [
        { line: fee, adjustments: [] },
        { line: item, adjustments: [] },
        { line: held, adjustments: [] },
      ],
      errands,
    );
    const payout = feed.find((i) => i.kind === 'payout')!;
    expect(payout).toMatchObject({
      id: 'payout:l-1',
      status: S.PAID,
      amount: '-1020.00',
      errandId: null,
      reference: 'SLK1',
      lineIds: ['l-1', 'l-2'],
      paidAt: at,
    });
    expect(feed[0]).toBe(payout);
    expect(feed.find((i) => i.id === 'l-2')).toMatchObject({ errandTitle: null, errandReference: 'NT-2', payableAt: item.decidedAt });
    expect(feed.find((i) => i.id === 'l-3')).toMatchObject({ status: S.ON_HOLD, amount: '400.00', reviewReason: R.RECEIPT_MISSING, payableAt: null });
    expect(sum(feed)).toBe(0);
  });

  it('reversal, re-sent payout and correction entries link to their line', () => {
    const fee = line({ status: S.PAID, payoutReference: 'SLK1', paidAt: PAID_AT });
    const steps = [
      adj(T.REVERSAL, { id: 'a-1', previousAmount: '300.00', payoutReference: 'REV1', createdAt: new Date('2026-10-11T01:00:00Z') }),
      adj(T.RESENT_PAYOUT, { id: 'a-2', previousAmount: '0.00', amount: '250.00', payoutReference: 'SLK2', createdAt: new Date('2026-10-11T02:00:00Z') }),
    ];
    const feed = payoutFeedOf([{ line: fee, adjustments: steps }], errands);
    expect(feed.map((i) => [i.kind, i.amount, i.relatedLineId])).toEqual([
      [T.RESENT_PAYOUT, '-250.00', 'l-1'],
      [T.REVERSAL, '300.00', 'l-1'],
      ['payout', '-300.00', null],
      [T.RUNNER_FEE, '300.00', null],
    ]);
    // Re-sent 250 of 300: 50 still available, as the position says.
    expect(sum(feed)).toBe(50);
    expect(linePositionOf(fee, steps).available).toBe(50);
  });

  it('serves the feed with kind and errand filters and a cursor', async () => {
    const b = build({ feePaid: 300, itemPaid: 1000 });
    await b.service.recordConfirmed(b.manager as never, 'e-1');
    await b.service.markPaid(['l-1', 'l-2'], 'SLK9', 'admin-1');
    const all = await b.service.payoutLinesFor('u-run', { limit: 2 });
    expect(all.items.map((i) => i.kind)).toEqual(['payout', T.ITEM_REIMBURSEMENT]);
    const next = await b.service.payoutLinesFor('u-run', { limit: 2, cursor: all.nextCursor! });
    expect(next.items.map((i) => i.kind)).toEqual([T.RUNNER_FEE]);
    expect(next.nextCursor).toBeNull();
    const payouts = await b.service.payoutLinesFor('u-run', { kinds: ['payout'] });
    expect(payouts.items).toHaveLength(1);
    expect(JSON.stringify(all)).not.toMatch(/admin-1|decisionNote|Task confirmed/);
  });
});

describe('RunnerPayoutsService.earningsFor', () => {
  it("adds the runner's tasks awaiting confirmation as pendingAmount in one aggregate query", async () => {
    const b = build({ feePaid: 300, itemPaid: 200 });
    b.query.mockImplementation(((sql: string) =>
      Promise.resolve(sql.includes('WITH mine AS') ? [{ total: '1000.00' }] : [])) as never);
    const out = await b.service.earningsFor('u-run', {});
    const calls = b.query.mock.calls.filter(([sql]) => String(sql).includes('WITH mine AS'));
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toEqual(['u-run', [ErrandStatus.AWAITING_CUSTOMER, ErrandStatus.COMPLETED, ErrandStatus.DISPUTED]]);
    expect(b.errands.listFor).not.toHaveBeenCalled();
    expect(out).toMatchObject({ pendingAmount: '1000.00', availableAmount: '0.00', week: expect.any(Array) });
  });
});

describe('row 135: approval is capped by max_purchase_advance too', () => {
  it('an over-limit item line found at CONFIRMED can be approved only up to the limit', async () => {
    const b = build({ itemPaid: 3500, maxPurchaseAdvance: '3000.00' });
    await b.service.recordConfirmed(b.manager as never, 'e-1');
    const item = b.table.find((r) => r.kind === T.ITEM_REIMBURSEMENT)!;
    expect(item).toMatchObject({ status: S.ON_HOLD, reviewReason: R.OVER_PURCHASE_LIMIT, capAmount: '3500.00' });
    const err = await b.service.review(item.id, { decision: 'approve', amount: 3000.01 }, 'a').catch((e: unknown) => e);
    expect((err as ApiError).getResponse()).toMatchObject({
      code: 'reimbursement_exceeds_cap',
      cap: '3000.00',
      itemPaidToNitume: '3500.00',
      maxPurchaseAdvance: '3000.00',
    });
    await b.service.review(item.id, { decision: 'approve', amount: 3000 }, 'a');
    expect(item).toMatchObject({ status: S.PAYABLE, amount: '3000.00' });
  });

  it('row 142: the combined-cap override never lifts the purchase limit', async () => {
    const b = build({ itemPaid: 3500, maxPurchaseAdvance: '3000.00' });
    await b.service.recordConfirmed(b.manager as never, 'e-1');
    const item = b.table.find((r) => r.kind === T.ITEM_REIMBURSEMENT)!;
    const err = await b.service
      .review(
        item.id,
        { decision: 'approve', amount: 3500, exposureOverrideNote: 'Ops agreed to pay the full receipt amount' },
        'a',
      )
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'reimbursement_exceeds_cap' });
    expect((err as ApiError).getResponse()).toMatchObject({ approvalCeiling: '3000.00', maxPurchaseAdvance: '3000.00' });
    expect(item).toMatchObject({ status: S.ON_HOLD, amount: null });
  });
});

describe('row 136: combined cap with customer refunds', () => {
  it('approval above paid-to-Nitume minus refunds needs an audited override', async () => {
    const b = build({ itemPaid: 500, totalPaid: 1000 });
    b.errands.getById.mockResolvedValue({ id: 'e-1', status: ErrandStatus.CANCELLED });
    await b.service.claim('u-run', { errandId: 'e-1', amount: 500, receiptEvidenceId: 'ev-1' });
    // The customer already got 700 of the 1000 back: 300 left for the runner.
    b.refunds.committedRefundTotal.mockResolvedValue(700);
    const err = await b.service.review('l-1', { decision: 'approve', amount: 400 }, 'admin-1').catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'task_exposure_cap_exceeded' });
    expect((err as ApiError).getResponse()).toMatchObject({
      totalPaidToNitume: '1000.00',
      committedRefunds: '700.00',
      committedReimbursements: '0.00',
      remaining: '300.00',
      requested: '400.00',
    });
    expect(b.table[0].status).toBe(S.ON_HOLD);
    const out = await b.service.review(
      'l-1',
      { decision: 'approve', amount: 400, exposureOverrideNote: 'Customer refund sent before the receipt arrived' },
      'admin-1',
    );
    expect(out).toMatchObject({ status: S.PAYABLE, amount: '400.00' });
    expect(b.overrides).toEqual([
      expect.objectContaining({
        source: 'runner_reimbursement',
        runnerPayoutLineId: 'l-1',
        amount: '400.00',
        normalCap: '300.00',
        createdByUserId: 'admin-1',
      }),
    ]);
    expect(out.exposureOverrides).toHaveLength(1);
    // The per-line caps still apply even with an override.
    const capped = build({ itemPaid: 500, totalPaid: 1000 });
    capped.errands.getById.mockResolvedValue({ id: 'e-1', status: ErrandStatus.CANCELLED });
    await capped.service.claim('u-run', { errandId: 'e-1', amount: 500, receiptEvidenceId: 'ev-1' });
    expect(
      await codeOf(capped.service.review('l-1', { decision: 'approve', amount: 501, exposureOverrideNote: 'Override please now' }, 'a')),
    ).toBe('reimbursement_exceeds_cap');
  });

  it('claims take the task lock but are always recorded on hold for ops review', async () => {
    const b = build({ itemPaid: 500, totalPaid: 1000 });
    b.refunds.committedRefundTotal.mockResolvedValue(1000);
    await b.service.claim('u-run', { errandId: 'e-1', amount: 500, receiptEvidenceId: 'ev-1' });
    expect(b.table[0]).toMatchObject({ status: S.ON_HOLD });
    expect(b.query.mock.calls.some(([, p]) => (p as string[])[0] === 'task_exposure:e-1')).toBe(true);
  });
});

describe('pending price decrease at CONFIRMED (re-review fix)', () => {
  it('puts the item line on hold (price_decrease_pending) and takes the task lock first', async () => {
    const b = build({ feePaid: 300, itemPaid: 1000 });
    b.refunds.hasPendingDecrease.mockResolvedValue(true);
    await b.service.recordConfirmed(b.manager as never, 'e-1');
    expect(b.query.mock.calls[0]).toEqual([expect.stringContaining('pg_advisory_xact_lock'), ['task_exposure:e-1']]);
    expect(b.table).toEqual([
      expect.objectContaining({ kind: T.RUNNER_FEE, status: S.PAYABLE }),
      expect.objectContaining({
        kind: T.ITEM_REIMBURSEMENT,
        status: S.ON_HOLD,
        amount: null,
        requestedAmount: '1000.00',
        reviewReason: R.PRICE_DECREASE_PENDING,
      }),
    ]);
    expect(b.refunds.hasPendingDecrease).toHaveBeenCalledWith('e-1', b.manager);
  });
});

describe('row 152: the purchase limit is the one in force when the line was created', () => {
  it('stores the limit on the item line at CONFIRMED and at a claim, never on the runner fee', async () => {
    const b = build({ itemPaid: 2000, feePaid: 300, maxPurchaseAdvance: '3000.00' });
    await b.service.recordConfirmed(b.manager as never, 'e-1');
    expect(b.table.find((r) => r.kind === T.ITEM_REIMBURSEMENT)).toMatchObject({ purchaseLimitAtCreation: '3000.00' });
    expect(b.table.find((r) => r.kind === T.RUNNER_FEE)).toMatchObject({ purchaseLimitAtCreation: null });
    const c = build({ itemPaid: 2000, maxPurchaseAdvance: '2500.00' });
    await c.service.claim('u-run', { errandId: 'e-1', amount: 1500, receiptEvidenceId: 'ev-1' });
    expect(c.table[0]).toMatchObject({ purchaseLimitAtCreation: '2500.00' });
  });

  it('created at KES 3,000, limit later raised to 5,000: the ceiling stays 3,000', async () => {
    const b = build({ itemPaid: 4000, maxPurchaseAdvance: '3000.00' });
    await b.service.recordConfirmed(b.manager as never, 'e-1');
    const item = b.table.find((r) => r.kind === T.ITEM_REIMBURSEMENT)!;
    expect(item).toMatchObject({ status: S.ON_HOLD, reviewReason: R.OVER_PURCHASE_LIMIT });
    const runner = (await b.runners.profileById()) as { maxPurchaseAdvance: string };
    runner.maxPurchaseAdvance = '5000.00';
    const detail = await b.service.detail(item.id);
    expect(detail).toMatchObject({
      approvalCeiling: '3000.00',
      purchaseLimit: '3000.00',
      purchaseLimitAtCreation: '3000.00',
      currentPurchaseLimit: '5000.00',
    });
    expect(detail.runner).toMatchObject({ maxPurchaseAdvance: '5000.00' });
    const err = await b.service.review(item.id, { decision: 'approve', amount: 3000.01 }, 'a').catch((e: unknown) => e);
    expect((err as ApiError).getResponse()).toMatchObject({
      code: 'reimbursement_exceeds_cap',
      approvalCeiling: '3000.00',
      purchaseLimit: '3000.00',
      maxPurchaseAdvance: '3000.00',
      currentPurchaseLimit: '5000.00',
    });
    await b.service.review(item.id, { decision: 'approve', amount: 3000 }, 'a');
    expect(item).toMatchObject({ status: S.PAYABLE, amount: '3000.00' });
  });

  it('a later lower limit does not cut an existing review either', async () => {
    const b = build({ itemPaid: 2800, maxPurchaseAdvance: '3000.00', receipts: [] });
    await b.service.recordConfirmed(b.manager as never, 'e-1');
    const item = b.table.find((r) => r.kind === T.ITEM_REIMBURSEMENT)!;
    const runner = (await b.runners.profileById()) as { maxPurchaseAdvance: string };
    runner.maxPurchaseAdvance = '1000.00';
    await b.service.review(item.id, { decision: 'approve', amount: 2800 }, 'a');
    expect(item).toMatchObject({ status: S.PAYABLE, amount: '2800.00' });
  });

  it('lines created before row 152 (no stored limit) use the current limit', () => {
    expect(purchaseLimitOf({ purchaseLimitAtCreation: null }, '5000.00')).toBe(5000);
    expect(purchaseLimitOf({ purchaseLimitAtCreation: '3000.00' }, '5000.00')).toBe(3000);
    expect(approvalCeilingOf({ requestedAmount: '4000.00', capAmount: '4000.00', purchaseLimitAtCreation: null }, 4000, '5000.00')).toBe(4000);
    expect(approvalCeilingOf({ requestedAmount: '4000.00', capAmount: '4000.00', purchaseLimitAtCreation: '3000.00' }, 4000, '5000.00')).toBe(3000);
    expect(overLimitCeilingOf({ requestedAmount: '4000.00', capAmount: '4000.00' }, 3500)).toBe(3500);
  });
});

describe('rows 142, 151 (N-21): purchase-limit exception', () => {
  const NOTE = 'Runner had ops approval by phone for this purchase';
  const overLimit = async (opts: { itemPaid?: number; totalPaid?: number } = {}) => {
    const b = build({ itemPaid: opts.itemPaid ?? 3500, maxPurchaseAdvance: '3000.00', totalPaid: opts.totalPaid });
    await b.service.recordConfirmed(b.manager as never, 'e-1');
    const item = b.table.find((r) => r.kind === T.ITEM_REIMBURSEMENT)!;
    return { ...b, item };
  };

  it('without a note the approval stays at the ordinary ceiling; the error shows overLimitCeiling', async () => {
    const b = await overLimit();
    const detail = await b.service.detail(b.item.id);
    expect(detail).toMatchObject({ approvalCeiling: '3000.00', overLimitCeiling: '3500.00', purchaseLimitOverride: null });
    const err = await b.service.review(b.item.id, { decision: 'approve', amount: 3200 }, 'admin-1').catch((e: unknown) => e);
    expect((err as ApiError).getResponse()).toMatchObject({
      code: 'reimbursement_exceeds_cap',
      cap: '3000.00',
      approvalCeiling: '3000.00',
      overLimitCeiling: '3500.00',
      maxPurchaseAdvance: '3000.00',
    });
    expect(b.overrides).toEqual([]);
  });

  it('refuses a note outside 10-500 characters (400 purchase_limit_override_note_invalid)', async () => {
    const b = await overLimit();
    for (const note of ['too short', 'x'.repeat(501)]) {
      const err = await b.service
        .review(b.item.id, { decision: 'approve', amount: 3200, purchaseLimitOverrideNote: note }, 'admin-1')
        .catch((e: unknown) => e);
      expect(err).toMatchObject({ code: 'purchase_limit_override_note_invalid' });
      expect((err as ApiError).getStatus()).toBe(400);
    }
    expect(b.item.status).toBe(S.ON_HOLD);
  });

  it('with a note approves above the limit and records the exception in the same decision', async () => {
    const b = await overLimit();
    const out = await b.service.review(
      b.item.id,
      { decision: 'approve', amount: 3500, purchaseLimitOverrideNote: `  ${NOTE}  ` },
      'admin-1',
    );
    expect(b.item).toMatchObject({ status: S.PAYABLE, amount: '3500.00', decidedByUserId: 'admin-1' });
    expect(b.overrides).toEqual([
      expect.objectContaining({
        source: 'purchase_limit',
        errandId: 'e-1',
        runnerPayoutLineId: b.item.id,
        runnerProfileId: 'rp-1',
        assignmentId: 'as-1',
        limitAtTime: '3000.00',
        requestedAmount: '3500.00',
        amount: '3500.00',
        normalCap: '3000.00',
        note: NOTE,
        createdByUserId: 'admin-1',
      }),
    ]);
    expect(out.purchaseLimitOverride).toMatchObject({
      errandId: 'e-1',
      assignmentId: 'as-1',
      runnerProfileId: 'rp-1',
      lineId: b.item.id,
      limitAtTime: '3000.00',
      requestedAmount: '3500.00',
      approvedAmount: '3500.00',
      amountAbove: '500.00',
      note: NOTE,
      createdBy: { id: 'admin-1', displayName: 'Finance' },
    });
    // Not a combined-cap override.
    expect(out.exposureOverrides).toEqual([]);
  });

  it('never goes above the item amount paid to Nitume, even with a note', async () => {
    const b = await overLimit();
    vi.spyOn(b.service, 'itemPaidToNitume').mockResolvedValue(3300);
    const err = await b.service
      .review(b.item.id, { decision: 'approve', amount: 3300.01, purchaseLimitOverrideNote: NOTE }, 'admin-1')
      .catch((e: unknown) => e);
    expect((err as ApiError).getResponse()).toMatchObject({ code: 'reimbursement_exceeds_cap', cap: '3300.00', overLimitCeiling: '3300.00' });
    expect(b.overrides).toEqual([]);
  });

  it('a note on an ordinary approval is ignored, even an invalid one (no exception recorded, review minor 10)', async () => {
    const b = await overLimit();
    await b.service.review(b.item.id, { decision: 'approve', amount: 3000, purchaseLimitOverrideNote: 'x' }, 'admin-1');
    expect(b.item).toMatchObject({ status: S.PAYABLE, amount: '3000.00' });
    expect(b.overrides).toEqual([]);
  });

  it('the combined cap still applies: both decisions need their own note', async () => {
    const b = await overLimit({ totalPaid: 3200 });
    expect(
      await codeOf(b.service.review(b.item.id, { decision: 'approve', amount: 3500, purchaseLimitOverrideNote: NOTE }, 'admin-1')),
    ).toBe('task_exposure_cap_exceeded');
    expect(b.overrides).toEqual([]);
    await b.service.review(
      b.item.id,
      {
        decision: 'approve',
        amount: 3500,
        purchaseLimitOverrideNote: NOTE,
        exposureOverrideNote: 'Fees were refunded before the receipt arrived',
      },
      'admin-1',
    );
    expect(b.overrides.map((o) => (o as { source: string }).source)).toEqual(['runner_reimbursement', 'purchase_limit']);
  });
});

describe('rows 117, 153: payout feed entries carry the payout request', () => {
  it('a payout made on a request shows payoutRequestId and requestedAmount', () => {
    const paid = line({ status: S.PAID, payoutReference: 'SGH1', paidAt: PAID_AT, payoutRequestId: 'pr-1' });
    const plain = line({ id: 'l-2', errandId: 'e-2', status: S.PAID, payoutReference: 'SGH2', paidAt: PAID_AT });
    const feed = payoutFeedOf(
      [
        { line: paid, adjustments: [] },
        { line: plain, adjustments: [] },
      ],
      new Map(),
      new Map([['pr-1', '5000.00']]),
    );
    expect(feed.find((i) => i.id === 'payout:l-1')).toMatchObject({ kind: 'payout', payoutRequestId: 'pr-1', requestedAmount: '5000.00' });
    expect(feed.find((i) => i.id === 'payout:l-2')).toMatchObject({ payoutRequestId: null, requestedAmount: null });
    expect(feed.find((i) => i.id === 'l-1')).toMatchObject({ payoutRequestId: 'pr-1', requestedAmount: null });
  });
});
