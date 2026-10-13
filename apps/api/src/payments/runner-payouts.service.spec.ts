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
    lineType: T.RUNNER_FEE,
    status: S.PAYABLE,
    requestedAmount: '300.00',
    amount: '300.00',
    capAmount: null,
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

const adj = (lineType: T, over: Partial<RunnerPayoutLine> = {}) =>
  line({ lineType, status: S.RECORDED, relatedLineId: 'l-1', amount: null, requestedAmount: null, ...over });

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
const build = (opts: { feePaid?: number; itemPaid?: number; receipts?: object[]; maxPurchaseAdvance?: string } = {}) => {
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
      const [runnerProfileId, errandId, lineType, status, requestedAmount, amount, capAmount, reviewReason, receiptEvidenceId, note, createdByUserId] =
        params as string[];
      if (table.some((r) => r.errandId === errandId && r.lineType === lineType)) {
        return Promise.resolve([]);
      }
      const id = nextId();
      table.push(
        line({
          id,
          runnerProfileId,
          errandId,
          lineType: lineType as T,
          status: status as S,
          requestedAmount,
          amount,
          capAmount,
          reviewReason: reviewReason as R,
          receiptEvidenceId,
          note,
          createdByUserId,
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
          lineType: r.lineType,
        }));
      return Promise.resolve([...(uses.get(ref) ?? []), ...fromLines]);
    }
    return Promise.resolve([]);
  });
  const manager = { query, getRepository: () => repo };
  const lines = { ...repo, manager: { transaction: vi.fn((fn: (m: unknown) => unknown) => fn(manager)) } };
  const errands = {
    onConfirmed: vi.fn(),
    activeAssignmentFor: vi.fn(() => Promise.resolve({ runnerProfileId: 'rp-1' })),
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
  const service = new RunnerPayoutsService(
    lines as never,
    {} as never,
    errands as never,
    runners as never,
    evidence as never,
    { committedRefundTotal: vi.fn(() => Promise.resolve(0)) } as never,
    users as never,
  );
  vi.spyOn(service, 'runnerFeePaid').mockResolvedValue(opts.feePaid ?? 300);
  vi.spyOn(service, 'itemPaidToNitume').mockResolvedValue(opts.itemPaid ?? 0);
  return { service, table, errands, evidence, query, uses, manager, repo };
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
    expect(linePositionOf(paid, steps.slice(0, 1))).toMatchObject({ status: S.PAID, paid: 250, payable: 0 });
    expect(linePositionOf(paid, steps)).toMatchObject({ status: S.PAYABLE, paid: 0, payable: 300 });
    const resent = [...steps, adj(T.RESEND, { payoutReference: 'QEF2', amount: '300.00', createdAt: t2 })];
    expect(linePositionOf(paid, resent)).toMatchObject({
      status: S.PAID,
      paid: 300,
      payout: { state: 'sent', reference: 'QEF2' },
    });
    expect(linePositionOf(line({ status: S.PENDING_REVIEW, amount: null, requestedAmount: '500.00' }))).toMatchObject({
      status: S.PENDING_REVIEW,
      pendingReview: 500,
      payable: 0,
    });
    expect(linePositionOf(line({ status: S.REJECTED, amount: null }))).toMatchObject({ pendingReview: 0, payable: 0, paid: 0 });
  });
});

describe('earnings summary (derived, never stored)', () => {
  it('splits balance by type and buckets earnings and payouts by EAT day', () => {
    const rows = [
      // Fee confirmed 2026-10-09 21:30 UTC = 2026-10-10 00:30 EAT; paid 10-10.
      { line: line({ createdAt: new Date('2026-10-09T21:30:00Z'), status: S.PAID, payoutReference: 'Q1', paidAt: PAID_AT }), adjustments: [] },
      { line: line({ id: 'l-2', lineType: T.ITEM_REIMBURSEMENT, amount: '1000.00', requestedAmount: '1000.00', createdAt: new Date('2026-10-11T09:00:00Z') }), adjustments: [] },
      { line: line({ id: 'l-3', lineType: T.ITEM_REIMBURSEMENT, status: S.PENDING_REVIEW, amount: null, requestedAmount: '400.00' }), adjustments: [] },
      { line: line({ id: 'l-4', status: S.REJECTED, amount: null }), adjustments: [] },
    ];
    const out = earningsSummaryOf(rows, earningsRangeOf({ from: '2026-10-09', to: '2026-10-11' }));
    expect(out.balance).toEqual({ pendingReview: '400.00', payable: '1000.00', paid: '300.00' });
    expect(out.byType.runnerFee).toEqual({ pendingReview: '0.00', payable: '0.00', paid: '300.00' });
    expect(out.byType.itemReimbursement).toEqual({ pendingReview: '400.00', payable: '1000.00', paid: '0.00' });
    expect(out.period.buckets).toEqual([
      { start: '2026-10-09', runnerFee: '0.00', itemReimbursement: '0.00', paidOut: '0.00' },
      { start: '2026-10-10', runnerFee: '300.00', itemReimbursement: '0.00', paidOut: '300.00' },
      { start: '2026-10-11', runnerFee: '0.00', itemReimbursement: '1000.00', paidOut: '0.00' },
    ]);
    expect(out.period.totals).toEqual({ runnerFee: '300.00', itemReimbursement: '1000.00', paidOut: '300.00' });

    const weekly = earningsSummaryOf(rows, earningsRangeOf({ from: '2026-10-01', to: '2026-10-13', groupBy: 'week' }));
    expect(weekly.period.buckets.map((b) => b.start)).toEqual(['2026-09-28', '2026-10-05', '2026-10-12']);
    expect(weekly.period.buckets[1]).toMatchObject({ runnerFee: '300.00', itemReimbursement: '1000.00' });
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
    lineType: 'runner_fee',
    ...over,
  });
  const target = { runnerProfileId: 'rp-1', obligationIds: ['l-1'], isReversal: false };
  it('allows one receipt across lines of the same runner only', () => {
    expect(runnerReferenceConflict([], target)).toBe(false);
    expect(runnerReferenceConflict([use({})], target)).toBe(false);
    expect(runnerReferenceConflict([use({ runnerProfileId: 'rp-2' })], target)).toBe(true);
    expect(runnerReferenceConflict([use({ source: 'refund', runnerProfileId: null })], target)).toBe(true);
    expect(runnerReferenceConflict([use({ lineType: 'reversal' })], target)).toBe(true);
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
    const { service, table, manager } = build({ feePaid: 300, itemPaid: 1000 });
    await service.recordConfirmed(manager as never, 'e-1');
    expect(table).toEqual([
      expect.objectContaining({ lineType: T.RUNNER_FEE, status: S.PAYABLE, amount: '300.00', runnerProfileId: 'rp-1' }),
      expect.objectContaining({
        lineType: T.ITEM_REIMBURSEMENT,
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
    expect(table[0]).toMatchObject({ lineType: T.RUNNER_FEE, status: S.PAYABLE });
    expect(table[1]).toMatchObject({
      status: S.PENDING_REVIEW,
      amount: null,
      requestedAmount: '1000.00',
      reviewReason: R.RECEIPT_MISSING,
    });
  });

  it('sends a purchase above max_purchase_advance to ops review (row 108)', async () => {
    const { service, table, manager } = build({ itemPaid: 3500, maxPurchaseAdvance: '3000.00' });
    await service.recordConfirmed(manager as never, 'e-1');
    expect(table[1]).toMatchObject({ status: S.PENDING_REVIEW, reviewReason: R.OVER_PURCHASE_LIMIT });
  });

  it('creates no item line when nothing was paid to Nitume for the item (merchant_direct)', async () => {
    const { service, table, manager } = build({ itemPaid: 0 });
    await service.recordConfirmed(manager as never, 'e-1');
    expect(table.map((r) => r.lineType)).toEqual([T.RUNNER_FEE]);
  });

  it('row 95 still holds: lines are only created through the CONFIRMED hook', () => {
    const source = readFileSync(join(__dirname, 'runner-payouts.service.ts'), 'utf-8');
    const insertCalls = source.match(/this\.insertObligation\(/g) ?? [];
    // recordConfirmed (fee + item) and claim (CANCELLED/FAILED, always in review).
    expect(insertCalls).toHaveLength(3);
    expect(source).toMatch(/status: S\.PENDING_REVIEW,\s+requestedAmount: input\.amount/);
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
          lineType: T.ITEM_REIMBURSEMENT,
          status: S.PENDING_REVIEW,
          requestedAmount: '800.00',
          capAmount: '1000.00',
          reviewReason: R.OUT_OF_POCKET_CLAIM,
          receiptEvidenceId: 'ev-1',
          createdByUserId: 'u-run',
          note: 'bought it',
        }),
      ]);
      expect(view).toMatchObject({ status: S.PENDING_REVIEW, amount: null, requestedAmount: '800.00' });
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

    const over = build({ itemPaid: 1000 });
    const err = await over.service.claim('u-run', { ...claim, amount: 1000.01 }).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'reimbursement_exceeds_cap' });
    expect((err as ApiError).getResponse()).toMatchObject({ cap: '1000.00' });

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
    expect(table[1]).toMatchObject({ status: S.PENDING_REVIEW, amount: null, reviewReason: R.RECEIPT_MISMATCH });
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
    uses.set('QREF1', [{ source: 'refund', runnerProfileId: null, lineId: null, obligationId: null, lineType: null }]);
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
    expect(await codeOf(add({ kind: T.RESEND, newReference: 'QX1', newAmount: 300 }))).toBe('payout_correction_kind_invalid');
    expect(await codeOf(add({ kind: T.REVERSAL }))).toBe('payout_reference_required');
    expect(await codeOf(add({ kind: T.REVERSAL, newReference: 'REV1', newAmount: 1 }))).toBe('payout_amount_not_allowed');
    expect(await codeOf(add({ kind: T.CORRECTION, newReference: 'QCD2', reason: 'abc' }))).toBe('correction_reason_invalid');

    const corrected = await add({ kind: T.CORRECTION, newReference: 'qcd2' });
    expect(corrected.effectivePayout).toMatchObject({ state: 'sent', reference: 'QCD2', amount: '300.00' });
    const reversed = await add({ kind: T.REVERSAL, newReference: 'REV1' });
    expect(reversed).toMatchObject({ effectiveStatus: S.PAYABLE, effectivePayout: { state: 'reversed', amount: '0.00' } });
    expect(await codeOf(add({ kind: T.RESEND, newReference: 'REV1', newAmount: 300 }))).toBe('payout_reference_reused');
    expect(await codeOf(add({ kind: T.RESEND, newReference: 'QAB1', newAmount: 300 }))).toBe('payout_reference_reused');
    expect(await codeOf(add({ kind: T.RESEND, newReference: 'QEF3' }))).toBe('payout_amount_required');
    const resent = await add({ kind: T.RESEND, newReference: 'QEF3', newAmount: 300 });
    expect(resent).toMatchObject({ effectiveStatus: S.PAID, effectivePayout: { state: 'sent', reference: 'QEF3' } });
    expect(resent.corrections.map((c) => [c.kind, c.previousReference, c.previousAmount, c.newReference])).toEqual([
      [T.CORRECTION, 'QAB1', '300.00', 'QCD2'],
      [T.REVERSAL, 'QCD2', '300.00', 'REV1'],
      [T.RESEND, null, '0.00', 'QEF3'],
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
