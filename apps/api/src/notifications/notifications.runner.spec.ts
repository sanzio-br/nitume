import { describe, expect, it, vi } from 'vitest';
import { AssignmentStatus, ErrandCategory, ErrandStatus } from '../common/enums';
import { NotificationsService, runnerEventFor, runnerJobCopy } from './notifications.service';

const build = (opts: { holder?: { runnerProfileId: string; status: AssignmentStatus } | null; route?: string; errand?: object } = {}) => {
  const notifications = {
    create: vi.fn((row: object) => row),
    save: vi.fn((row: object) => Promise.resolve({ id: 'n-9', ...row })),
  };
  const errandRepo = {
    findOne: vi.fn(() =>
      Promise.resolve({ id: 'e-1', title: null, category: ErrandCategory.BUY_FOR_ME, budget: '500.00', ...opts.errand }),
    ),
  };
  const queue = { add: vi.fn(() => Promise.resolve({})) };
  const errands = {
    activeAssignmentFor: vi.fn(() =>
      Promise.resolve(opts.holder === undefined ? { runnerProfileId: 'rp-1', status: AssignmentStatus.ACCEPTED } : opts.holder),
    ),
  };
  const runners = { profileById: vi.fn(() => Promise.resolve({ id: 'rp-1', userId: 'u-runner' })) };
  const payments = { primaryRouteFor: vi.fn(() => Promise.resolve(opts.route ?? 'send_to_runner')) };
  const service = new NotificationsService(
    notifications as never,
    errandRepo as never,
    {} as never,
    {} as never,
    queue as never,
    {} as never,
    { enabled: true } as never,
    undefined,
    errands as never,
    runners as never,
    payments as never,
  );
  return { service, notifications, queue };
};

describe('runnerEventFor (RA-6)', () => {
  it.each([
    [{ status: ErrandStatus.CANCELLED, from: ErrandStatus.IN_PROGRESS, actor: 'customer' }, 'cancelled'],
    [{ status: ErrandStatus.CANCELLED, from: ErrandStatus.DISPUTED, actor: 'admin' }, 'dispute_resolved'],
    [{ status: ErrandStatus.COMPLETED, from: ErrandStatus.AWAITING_CUSTOMER, actor: 'customer' }, 'confirmed'],
    [{ status: ErrandStatus.COMPLETED, from: ErrandStatus.DISPUTED, actor: 'admin' }, 'dispute_resolved'],
    [{ status: ErrandStatus.DISPUTED, from: ErrandStatus.AWAITING_CUSTOMER, actor: 'customer' }, 'disputed'],
    [{ status: ErrandStatus.FAILED, from: ErrandStatus.RUNNER_EN_ROUTE, actor: 'system' }, 'failed'],
    [{ status: ErrandStatus.FAILED, from: ErrandStatus.RUNNER_EN_ROUTE, actor: 'runner' }, null],
    [{ status: ErrandStatus.ARRIVED, from: ErrandStatus.RUNNER_EN_ROUTE, actor: 'system' }, null],
  ])('%o -> %s', (event, expected) => {
    expect(runnerEventFor(event)).toBe(expected);
  });
});

describe('runnerJobCopy (v-notifications.md, row 139)', () => {
  it('uses the exact runner wording', () => {
    expect(runnerJobCopy('cancelled', { task: 'Buy For Me', itemBought: true })).toEqual({
      eventType: 'errand.CANCELLED',
      title: 'Job cancelled',
      body: "Buy For Me was cancelled, so there's no runner fee. If you already bought the item, upload the receipt within 24 hours.",
    });
    expect(runnerJobCopy('failed', { task: 'Fix the gate', itemBought: false }).body).toBe(
      "Fix the gate ended as failed, so there's no runner fee.",
    );
    expect(runnerJobCopy('price_change_approved', { task: 'Buy For Me', itemBought: false, toPrice: '45000.00' })).toMatchObject({
      eventType: 'price_change.approved',
      title: 'Price change approved',
      body: 'New item amount for Buy For Me: KSh 45,000.',
    });
    expect(runnerJobCopy('dispute_resolved', { task: 'T', itemBought: false })).toMatchObject({
      eventType: 'dispute.resolved',
      title: 'Problem resolved',
    });
  });
});

describe('NotificationsService runner feed (RA-6)', () => {
  it('writes the item to the runner who accepted, with the receipt sentence on send_to_runner', async () => {
    const { service, notifications, queue } = build();
    const row = await service.deliverFeed({ kind: 'runner_job', errandId: 'e-1', event: 'cancelled' });
    expect(row).toMatchObject({ userId: 'u-runner', errandId: 'e-1', eventType: 'errand.CANCELLED', title: 'Job cancelled' });
    expect((notifications.create.mock.calls[0] as unknown as [{ body: string }])[0].body).toContain('upload the receipt within 24 hours');
    expect(queue.add).toHaveBeenCalledWith('push', { notificationId: 'n-9' }, { jobId: 'push-n-9' });
  });

  it('drops the receipt sentence on merchant_direct and uses the task title', async () => {
    const { service, notifications } = build({ route: 'merchant_direct', errand: { title: 'Phone for Mum' } });
    await service.deliverFeed({ kind: 'runner_job', errandId: 'e-1', event: 'failed' });
    expect((notifications.create.mock.calls[0] as unknown as [{ body: string }])[0].body).toBe(
      "Phone for Mum ended as failed, so there's no runner fee.",
    );
  });

  it('sends nothing when no runner accepted the job (row 197)', async () => {
    const { service, notifications } = build({ holder: { runnerProfileId: 'rp-1', status: AssignmentStatus.ASSIGNED } });
    await expect(service.deliverFeed({ kind: 'runner_job', errandId: 'e-1', event: 'cancelled' })).resolves.toBeNull();
    expect(notifications.save).not.toHaveBeenCalled();
  });

  it('queues runner items from status changes and price decisions, not from a customer reject', async () => {
    const { service, queue } = build();
    await service.onStatusChanged({ errandId: 'e-1', status: ErrandStatus.DISPUTED, from: ErrandStatus.AWAITING_CUSTOMER, actor: 'customer' });
    expect(queue.add).toHaveBeenCalledWith('feed', { kind: 'runner_job', errandId: 'e-1', event: 'disputed' });
    queue.add.mockClear();
    await service.onPriceChangeDecided({ errandId: 'e-1', outcome: 'approved', toPrice: '650.00' });
    expect(queue.add).toHaveBeenCalledWith('feed', { kind: 'runner_job', errandId: 'e-1', event: 'price_change_approved', toPrice: '650.00' });
    queue.add.mockClear();
    await service.onPriceChangeDecided({ errandId: 'e-1', outcome: 'cancelled', toPrice: '650.00' });
    expect(queue.add).not.toHaveBeenCalled();
  });
});
