import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../common/api-error';
import { RunnerPayoutLineStatus as S } from './runner-payout-line.entity';
import { RunnerPayoutRequest, RunnerPayoutRequestStatus as R } from './runner-payout-request.entity';
import { RunnerPayoutRequestsService } from './runner-payout-requests.service';

const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => (e instanceof ApiError ? e.code : String(e)),
  );

const build = (opts: { available?: number; minimum?: number } = {}) => {
  const table: RunnerPayoutRequest[] = [];
  const lines = [
    { id: 'l-1', runnerProfileId: 'rp-1', status: S.PAYABLE, amount: '3000.00', payoutRequestId: null },
    { id: 'l-2', runnerProfileId: 'rp-1', status: S.PAYABLE, amount: '1000.00', payoutRequestId: null },
    { id: 'l-3', runnerProfileId: 'rp-1', status: S.PAYABLE, amount: '1500.00', payoutRequestId: null },
    { id: 'l-x', runnerProfileId: 'rp-2', status: S.PAYABLE, amount: '100.00', payoutRequestId: null },
  ];
  let seq = 0;
  const reqRepo = {
    findOne: vi.fn(({ where }: { where: Partial<RunnerPayoutRequest> }) =>
      Promise.resolve(
        table.find((r) => Object.entries(where).every(([k, v]) => (r as never)[k] === v)) ?? null,
      ),
    ),
    create: vi.fn((v: Partial<RunnerPayoutRequest>) => v),
    save: vi.fn((v: RunnerPayoutRequest) => {
      const row = Object.assign(new RunnerPayoutRequest(), v, { id: `pr-${(seq += 1)}`, createdAt: new Date() });
      table.push(row);
      return Promise.resolve(row);
    }),
    update: vi.fn((id: string, patch: Partial<RunnerPayoutRequest>) => {
      Object.assign(table.find((r) => r.id === id)!, patch);
      return Promise.resolve({});
    }),
    find: vi.fn(({ where }: { where: { payoutRequestId?: { value: string[] } } }) =>
      Promise.resolve(lines.filter((l) => l.payoutRequestId && where.payoutRequestId?.value.includes(l.payoutRequestId))),
    ),
  };
  const lineRepo = {
    find: vi.fn(({ where }: { where: { id?: { value: string[] }; payoutRequestId?: { value: string[] } } }) =>
      Promise.resolve(
        where.id
          ? lines.filter((l) => where.id!.value.includes(l.id))
          : lines.filter((l) => l.payoutRequestId && where.payoutRequestId!.value.includes(l.payoutRequestId)),
      ),
    ),
  };
  const manager = {
    query: vi.fn(() => Promise.resolve([])),
    getRepository: (e: { name: string }) => (e.name === 'RunnerPayoutRequest' ? reqRepo : lineRepo),
  };
  const requests = {
    ...reqRepo,
    count: vi.fn(() => Promise.resolve(table.length)),
    manager: { ...manager, transaction: vi.fn((fn: (m: unknown) => unknown) => fn(manager)) },
  };
  const ledger = {
    availableFor: vi.fn(() => Promise.resolve(opts.available ?? 5500)),
    markPaidIn: vi.fn((_m: unknown, ids: string[], _ref: string, _admin: string, requestId: string) => {
      const rows = lines.filter((l) => ids.includes(l.id));
      for (const l of rows) {
        if (l.status !== S.PAYABLE) {
          return Promise.reject(new ApiError(409, 'runner_payout_not_payable', 'x'));
        }
      }
      const before = rows.map((l) => ({ ...l }));
      rows.forEach((l) => Object.assign(l, { status: S.PAID, payoutRequestId: requestId }));
      return Promise.resolve(before);
    }),
  };
  const runners = {
    profileByUserId: vi.fn(() => Promise.resolve({ id: 'rp-1', userId: 'u-run' })),
    profileById: vi.fn(() => Promise.resolve({ id: 'rp-1', userId: 'u-run' })),
    publicSummaries: vi.fn(() =>
      Promise.resolve(new Map([['rp-1', { id: 'rp-1', displayName: 'Kevin Otieno', shortName: 'Kevin O.' }]])),
    ),
  };
  const users = {
    findById: vi.fn(() => Promise.resolve({ id: 'u-run', phone: '+254733111222' })),
    displayNames: vi.fn(() => Promise.resolve(new Map([['admin-1', 'Finance']]))),
  };
  const config = { get: vi.fn(() => opts.minimum ?? 500) };
  const store = new Map<string, string>();
  const redis = {
    get: vi.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
    set: vi.fn((k: string, v: string) => {
      store.set(k, v);
      return Promise.resolve();
    }),
  };
  const service = new RunnerPayoutRequestsService(
    requests as never,
    ledger as never,
    runners as never,
    users as never,
    config as never,
    redis as never,
  );
  return { service, table, lines, ledger, redis };
};

describe('RunnerPayoutRequestsService (rows 117, 118, 146, 153)', () => {
  it('creates a request to the sign-in phone, up to the available amount', async () => {
    const b = build();
    const view = await b.service.create('u-run', 5000);
    expect(view).toMatchObject({
      requestedAmount: '5000.00',
      paidAmount: null,
      status: R.REQUESTED,
      destinationPhone: '+254733111222',
      paidAt: null,
      reference: null,
    });
  });

  it('refuses below the minimum, above the available amount and a second open request', async () => {
    const b = build({ available: 5500, minimum: 500 });
    const low = await b.service.create('u-run', 499.99).catch((e: unknown) => e);
    expect((low as ApiError).getResponse()).toMatchObject({ code: 'payout_below_minimum', minimumAmount: '500.00' });
    const high = await b.service.create('u-run', 5500.01).catch((e: unknown) => e);
    expect((high as ApiError).getResponse()).toMatchObject({ code: 'payout_exceeds_available', availableAmount: '5500.00' });
    await b.service.create('u-run', 1000);
    const again = await b.service.create('u-run', 1000).catch((e: unknown) => e);
    expect((again as ApiError).getResponse()).toMatchObject({ code: 'payout_request_open', requestId: 'pr-1' });
    expect((again as ApiError).getStatus()).toBe(409);
  });

  it('replays with the same Idempotency-Key return the same request', async () => {
    const b = build();
    const first = await b.service.create('u-run', 1000, 'key-1');
    const replay = await b.service.create('u-run', 1000, 'key-1');
    expect(replay.id).toBe(first.id);
    expect(b.table).toHaveLength(1);
  });

  it('paid with whole lines below the request: closes PAID, paidAmount = lines total (row 146)', async () => {
    const b = build();
    const req = await b.service.create('u-run', 5000);
    const out = await b.service.pay(req.id, ['l-1', 'l-2'], 'sgh12abc9', 'admin-1');
    expect(out).toMatchObject({
      status: R.PAID,
      requestedAmount: '5000.00',
      paidAmount: '4000.00',
      payoutReference: 'SGH12ABC9',
      decidedBy: { id: 'admin-1', displayName: 'Finance' },
      lineIds: ['l-1', 'l-2'],
    });
    expect(b.ledger.markPaidIn).toHaveBeenCalledWith(expect.anything(), ['l-1', 'l-2'], 'sgh12abc9', 'admin-1', req.id);
    expect(await codeOf(b.service.pay(req.id, ['l-3'], 'SGH12ABD0', 'admin-1'))).toBe('payout_request_not_open');
    // The remainder is not carried: a new request can be made for it.
    const next = await b.service.create('u-run', 1000);
    expect(next.status).toBe(R.REQUESTED);
  });

  it('refuses lines above the request or of another runner', async () => {
    const b = build();
    const req = await b.service.create('u-run', 4000);
    const over = await b.service.pay(req.id, ['l-1', 'l-2', 'l-3'], 'SGH12ABC9', 'a').catch((e: unknown) => e);
    expect((over as ApiError).getResponse()).toMatchObject({
      code: 'payout_exceeds_request',
      requestedAmount: '4000.00',
      selectedAmount: '5500.00',
    });
    expect(await codeOf(b.service.pay(req.id, ['l-x'], 'SGH12ABC9', 'a'))).toBe('payout_request_runner_mismatch');
    expect(b.ledger.markPaidIn).not.toHaveBeenCalled();
  });

  it('rejects with a runner-visible reason (5-300)', async () => {
    const b = build();
    const req = await b.service.create('u-run', 1000);
    expect(await codeOf(b.service.reject(req.id, 'no', 'admin-1'))).toBe('decision_note_required');
    const out = await b.service.reject(req.id, ' Payout details need checking ', 'admin-1');
    expect(out).toMatchObject({ status: R.REJECTED, note: 'Payout details need checking', paidAmount: null });
    expect(await codeOf(b.service.reject(req.id, 'again please', 'admin-1'))).toBe('payout_request_not_open');
  });
});
