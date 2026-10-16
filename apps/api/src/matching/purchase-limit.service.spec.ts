import { describe, expect, it, vi } from 'vitest';
import { AssignmentDeclineReason, AssignmentStatus, UserRole } from '../common/enums';
import { PurchaseLimitService } from './purchase-limit.service';

const build = (required: number, limit = '3000.00') => {
  const errands = {
    getById: vi.fn(() => Promise.resolve({ id: 'e-1' })),
    activeAssignmentFor: vi.fn(() => Promise.resolve({ runnerProfileId: 'rp-1' })),
    declineAssignment: vi.fn(
      async (_e: string, _u: string, reason: AssignmentDeclineReason, guard: (m: unknown, c: object) => Promise<void>) => {
        await guard({}, { errandId: 'e-1', runnerProfileId: 'rp-1', reason });
        return { id: 'a-1', status: AssignmentStatus.DECLINED };
      },
    ),
  };
  const runners = {
    profileById: vi.fn((id: string) => Promise.resolve({ id, maxPurchaseAdvance: limit })),
    profileByUserId: vi.fn(() => Promise.resolve({ id: 'rp-1', maxPurchaseAdvance: limit })),
  };
  const ledger = { itemPaidToNitume: vi.fn(() => Promise.resolve(required)) };
  return { service: new PurchaseLimitService(errands as never, runners as never, ledger as never), errands };
};

describe('PurchaseLimitService (row 108)', () => {
  it('compares the item amount the runner must buy with max_purchase_advance', async () => {
    const runner = { role: UserRole.RUNNER, userId: 'u-run' };
    await expect(build(3500).service.check('e-1', runner)).resolves.toEqual({
      errandId: 'e-1',
      runnerProfileId: 'rp-1',
      requiredPurchase: '3500.00',
      maxPurchaseAdvance: '3000.00',
      overLimit: true,
    });
    await expect(build(3000).service.check('e-1', runner)).resolves.toMatchObject({ overLimit: false });
    // Admin before assigning: any runner by id.
    const admin = { role: UserRole.ADMIN, userId: 'admin-1' };
    await expect(build(0).service.check('e-1', admin, 'rp-9')).resolves.toMatchObject({
      runnerProfileId: 'rp-9',
      requiredPurchase: '0.00',
      overLimit: false,
    });
  });

  it('declines only over the limit; within it is 409 purchase_within_limit', async () => {
    const over = await build(3500).service.decline('e-1', 'u-run', AssignmentDeclineReason.OVER_PURCHASE_LIMIT);
    expect(over).toMatchObject({
      assignmentId: 'a-1',
      status: AssignmentStatus.DECLINED,
      declineReason: 'over_purchase_limit',
      requiredPurchase: '3500.00',
      overLimit: true,
    });
    await expect(
      build(2000).service.decline('e-1', 'u-run', AssignmentDeclineReason.OVER_PURCHASE_LIMIT),
    ).rejects.toMatchObject({ code: 'purchase_within_limit' });
  });
});
