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

const build = (opts: { verified?: boolean; holder?: string } = {}) => {
  const errands = {
    openOffersFor: vi.fn(() => Promise.resolve({ items: [{ errand, assignment: offer }], nextCursor: null })),
    locationsAndItemsFor: vi.fn(() =>
      Promise.resolve({ locations: new Map([['e-1', locations]]), items: new Map([['e-1', []]]) }),
    ),
    getById: vi.fn(() => Promise.resolve(errand)),
    activeAssignmentFor: vi.fn(() => Promise.resolve({ ...offer, runnerProfileId: opts.holder ?? 'rp-1' })),
    transition: vi.fn(() => Promise.resolve({ errand, history: { id: 'h-1' } })),
  };
  const runners = {
    profileByUserId: vi.fn(() => Promise.resolve({ id: 'rp-1' })),
    assertVerified: vi.fn(() =>
      opts.verified === false ? Promise.reject(new ApiError(403, 'runner_not_verified', 'no')) : Promise.resolve(),
    ),
  };
  const ledger = { runnerFeePaid: vi.fn(() => Promise.resolve(300)) };
  const payments = { primaryRouteFor: vi.fn(() => Promise.resolve('send_to_runner')) };
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
});
