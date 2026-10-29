import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../common/api-error';
import { AssignmentStatus, ErrandCategory, ErrandStatus } from '../common/enums';
import { RunnerJobsService } from './runner-jobs.service';

const errand = {
  id: 'e-1',
  reference: 'NT-1',
  status: ErrandStatus.RUNNER_ASSIGNED,
  category: ErrandCategory.BUY_FOR_ME,
  title: 'Groceries',
  description: 'Milk',
  urgency: 'standard',
  deadlineAt: null,
  createdAt: new Date(0),
  budget: '5000.00',
  quotedPrice: '1000.00',
  runnerNotes: null,
};
const offer = {
  id: 'a-1',
  errandId: 'e-1',
  runnerProfileId: 'rp-1',
  status: AssignmentStatus.ASSIGNED,
  offerExpiresAt: new Date(Date.now() + 60_000),
  decidedAt: new Date(0),
  createdAt: new Date(1),
};
const locations = [
  { id: 'l-2', pointType: 'dropoff', lat: 1, lng: 1, addressText: 'B', placeId: null },
  { id: 'l-1', pointType: 'pickup', lat: 0, lng: 0, addressText: 'A', placeId: null },
];

const build = (
  opts: { verified?: boolean; holder?: string; route?: string; unpaid?: { priceChangeRequestId: string; amount: string; status: string }[] } = {},
) => {
  const errands = {
    openOffersFor: vi.fn(() => Promise.resolve({ items: [{ errand, assignment: offer }], nextCursor: null })),
    locationsAndItemsFor: vi.fn(() =>
      Promise.resolve({ locations: new Map([['e-1', locations]]), items: new Map([['e-1', []]]) }),
    ),
    getById: vi.fn(() => Promise.resolve(errand)),
    heldJobsFor: vi.fn(() =>
      Promise.resolve({ items: [{ errand, assignment: { ...offer, status: AssignmentStatus.ACCEPTED } }], nextCursor: 'c-2' }),
    ),
    activeAssignmentFor: vi.fn(() => Promise.resolve({ ...offer, runnerProfileId: opts.holder ?? 'rp-1' })),
    transition: vi.fn(() =>
      Promise.resolve({
        errand,
        history: {
          id: 'h-1',
          errandId: 'e-1',
          fromStatus: ErrandStatus.RUNNER_ASSIGNED,
          toStatus: ErrandStatus.RUNNER_EN_ROUTE,
          actorType: 'runner',
          actorId: 'u-1',
          note: 'runner note',
          createdAt: new Date(5),
        },
      }),
    ),
  };
  const runners = {
    profileByUserId: vi.fn(() => Promise.resolve({ id: 'rp-1' })),
    assertVerified: vi.fn(() =>
      opts.verified === false ? Promise.reject(new ApiError(403, 'runner_not_verified', 'no')) : Promise.resolve(),
    ),
  };
  const ledger = { runnerFeePaid: vi.fn(() => Promise.resolve(300)) };
  const payments = {
    primaryRouteFor: vi.fn(() => Promise.resolve(opts.route ?? 'send_to_runner')),
    unpaidDifferences: vi.fn(() => Promise.resolve(opts.unpaid ?? [])),
  };
  const limits = {
    checkIn: vi.fn(() =>
      Promise.resolve({ requiredPurchase: '5000.00', maxPurchaseAdvance: '3000.00', overLimit: true }),
    ),
    decline: vi.fn(),
  };
  return {
    service: new RunnerJobsService(errands as never, runners as never, ledger as never, payments as never, limits as never),
    errands,
  };
};

describe('RunnerJobsService (RA-1, RA-2)', () => {
  it('lists open offers in the runner projection: runner fee and item, never the customer price', async () => {
    const { items } = await build().service.offers('u-1');
    expect(items[0]).toMatchObject({
      id: 'e-1',
      runnerFee: '300.00',
      itemAmount: '5000.00',
      merchantRoute: 'send_to_runner',
      requiredPurchase: '5000.00',
      maxPurchaseAdvance: '3000.00',
      overPurchaseLimit: true,
      differenceAwaitingPayment: null,
      offerExpiresAt: offer.offerExpiresAt,
      firstPoint: { id: 'l-1' },
      assignment: { id: 'a-1', status: 'assigned', decidedAt: null },
    });
    for (const k of ['feeTotal', 'quotedPrice', 'finalPrice', 'serviceFee', 'customerId']) {
      expect(items[0]).not.toHaveProperty(k);
    }
  });

  it('refuses offers to an unverified runner (RA-8)', async () => {
    await expect(build({ verified: false }).service.offers('u-1')).rejects.toMatchObject({ code: 'runner_not_verified' });
  });

  it('the job view is only for the runner holding the current assignment', async () => {
    await expect(build({ holder: 'rp-2' }).service.job('u-1', 'e-1')).rejects.toMatchObject({ code: 'job_not_held', status: 403 });
    await expect(build().service.job('u-1', 'e-1')).resolves.toMatchObject({ id: 'e-1' });
  });

  it('codes the errand access refusal as job_not_held too (A2)', async () => {
    const built = build();
    built.errands.getById.mockRejectedValueOnce(new ForbiddenException());
    await expect(built.service.job('u-1', 'e-1')).rejects.toMatchObject({ code: 'job_not_held' });
  });

  it('accept is the runner RUNNER_ASSIGNED -> RUNNER_EN_ROUTE transition', async () => {
    const { service, errands } = build();
    await service.accept('u-1', 'e-1');
    expect(errands.transition).toHaveBeenCalledWith(
      'e-1',
      ErrandStatus.RUNNER_EN_ROUTE,
      { type: 'runner', id: 'u-1' },
      undefined,
      { role: 'runner', userId: 'u-1' },
    );
  });

  it('accept returns the history row without note or actorId (issue #35)', async () => {
    const { service } = build();
    const out = await service.accept('u-1', 'e-1');
    expect(out.history).toEqual({
      id: 'h-1',
      errandId: 'e-1',
      fromStatus: ErrandStatus.RUNNER_ASSIGNED,
      toStatus: ErrandStatus.RUNNER_EN_ROUTE,
      actorType: 'runner',
      createdAt: new Date(5),
    });
  });
});

describe('RunnerJobsService.heldJobs (A1)', () => {
  it('reads accepted held jobs since the 24 h window as RunnerJobViews', async () => {
    const { service, errands } = build();
    const now = new Date('2026-10-19T12:00:00Z');
    const page = await service.heldJobs('u-1', { limit: 5, cursor: 'c-1' }, now);
    expect(errands.heldJobsFor).toHaveBeenCalledWith('rp-1', { since: new Date('2026-10-18T12:00:00Z'), limit: 5, cursor: 'c-1' });
    expect(page.nextCursor).toBe('c-2');
    expect(page.items[0]).toMatchObject({ id: 'e-1', runnerFee: '300.00', offerExpiresAt: null, assignment: { status: 'accepted' } });
    expect(page.items[0]).not.toHaveProperty('feeTotal');
  });
});

describe('RunnerJobsService row 248: approved increase not yet paid', () => {
  const unpaid = [
    { priceChangeRequestId: 'pc-2', amount: '200.00', status: 'pending' },
    { priceChangeRequestId: 'pc-1', amount: '150.50', status: 'failed' },
  ];

  it('send_to_runner: exposes the unpaid difference; the buy ceiling (requiredPurchase) stays what Nitume holds', async () => {
    const job = await build({ unpaid }).service.job('u-1', 'e-1');
    expect(job.differenceAwaitingPayment).toEqual({ amount: '350.50', priceChangeRequestIds: ['pc-2', 'pc-1'] });
    expect(job.requiredPurchase).toBe('5000.00');
  });

  it('null once paid, and never on merchant_direct', async () => {
    expect((await build().service.job('u-1', 'e-1')).differenceAwaitingPayment).toBeNull();
    expect((await build({ unpaid, route: 'merchant_direct' }).service.job('u-1', 'e-1')).differenceAwaitingPayment).toBeNull();
  });
});
