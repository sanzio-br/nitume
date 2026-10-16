import { describe, expect, it, vi } from 'vitest';
import {
  ErrandStatus,
  NotificationEventType,
  NotificationSendStatus,
} from '../common/enums';
import {
  FEED_JOB,
  NotificationsService,
  PUSH_JOB,
  copyFor,
  formatKsh,
  notificationEventTypeFor,
} from './notifications.service';

const build = (
  opts: { pushEnabled?: boolean; tokens?: string[]; results?: object[]; admins?: string[] } = {},
) => {
  const notifications = {
    create: vi.fn((row: object) => row),
    save: vi.fn((row: object) => Promise.resolve({ id: 'n-1', ...row })),
    findOne: vi.fn(() =>
      Promise.resolve({
        id: 'n-1',
        userId: 'u-1',
        errandId: 'e-1',
        eventType: 'errand.RUNNER_ASSIGNED',
        title: 'Runner assigned',
        body: 'b',
      }),
    ),
  };
  const errands = { findOne: vi.fn(() => Promise.resolve({ id: 'e-1', customerId: 'c-1' })) };
  const customers = { findOne: vi.fn(() => Promise.resolve({ id: 'c-1', userId: 'u-1' })) };
  const logs = { create: vi.fn((row: object) => row), save: vi.fn((row: object) => Promise.resolve(row)) };
  const queue = { add: vi.fn(() => Promise.resolve({})) };
  const devices = {
    pushTokensFor: vi.fn(() => Promise.resolve(opts.tokens ?? ['tok-1'])),
    removeStaleTokens: vi.fn(() => Promise.resolve(1)),
  };
  const push = {
    name: 'fcm',
    enabled: opts.pushEnabled ?? true,
    send: vi.fn(() => Promise.resolve(opts.results ?? [{ token: 'tok-1', ok: true, stale: false }])),
  };
  const service = new NotificationsService(
    notifications as never,
    errands as never,
    customers as never,
    logs as never,
    queue as never,
    devices as never,
    push as never,
    { activeAdminIds: vi.fn(() => Promise.resolve(opts.admins ?? ['admin-1', 'admin-2'])) } as never,
  );
  return { service, notifications, queue, devices, push, logs, customers };
};

describe('NotificationEventType (A-14)', () => {
  it('maps every published errand status to `errand.<STATUS>`', () => {
    for (const value of Object.values(NotificationEventType).filter((v) => v.startsWith('errand.'))) {
      const status = value.replace('errand.', '') as ErrandStatus;
      expect(Object.values(ErrandStatus)).toContain(status);
      expect(notificationEventTypeFor(status)).toBe(value);
    }
  });

  it('returns null for statuses that do not produce a feed item', () => {
    for (const status of [
      ErrandStatus.DRAFT,
      ErrandStatus.REQUESTED,
      ErrandStatus.ACCEPTED,
      ErrandStatus.PAYMENT_CONFIRMED,
      ErrandStatus.CONFIRMED,
      ErrandStatus.SETTLED,
    ]) {
      expect(notificationEventTypeFor(status)).toBeNull();
    }
  });

  it('formats money as the app does (row 82)', () => {
    expect(formatKsh('40000.00')).toBe('KSh 40,000');
    expect(formatKsh('1250.50')).toBe('KSh 1,250.50');
    expect(formatKsh(null)).toBe('KSh 0');
  });

  it('uses KSh, never KES, in every amount copy (row 82)', () => {
    const bodies = [
      copyFor({ kind: 'price_change', errandId: 'e', requestId: 'r', fromPrice: '500.00', toPrice: '650.00' }),
      copyFor({ kind: 'refund', errandId: 'e', refundId: 'r', status: 'approved', refundAmount: '400.00' }),
      copyFor({ kind: 'refund', errandId: 'e', refundId: 'r', status: 'refunded', refundAmount: '400.00' }),
      copyFor({
        kind: 'quote_reissued',
        errandId: 'e',
        quoteId: 'q',
        total: '700.00',
        expiresAt: null,
        acceptanceRequired: false,
      }),
    ].map((c) => `${c?.title} ${c?.body}`);
    for (const text of bodies) {
      expect(text).toMatch(/KSh \d/);
      expect(text).not.toContain('KES');
    }
  });

  it('has copy for price-change and refund items', () => {
    expect(
      copyFor({ kind: 'price_change', errandId: 'e', requestId: 'r', fromPrice: '500.00', toPrice: '650.00' }),
    ).toMatchObject({ eventType: 'price_change.requested' });
    expect(
      copyFor({ kind: 'refund', errandId: 'e', refundId: 'r', status: 'refunded', refundAmount: '400.00' }),
    ).toMatchObject({ eventType: 'refund.refunded', body: expect.stringContaining('KSh 400') });
    expect(
      copyFor({ kind: 'refund', errandId: 'e', refundId: 'r', status: 'pending_review', refundAmount: null }),
    ).toBeNull();
  });
});

describe('errand.EXPIRED customer notification (row 158)', () => {
  it('has the owner copy and never mentions a refund review', () => {
    const copy = copyFor({ kind: 'errand_status', errandId: 'e', status: ErrandStatus.EXPIRED });
    expect(copy).toEqual({
      eventType: 'errand.EXPIRED',
      title: 'No runner available',
      body: 'Your task has expired because no runner was available to accept it within the required time. You can submit a new request if you still need this service.',
    });
    expect(copy?.body).not.toMatch(/refund/i);
  });

  it('is queued from errand.expired, not from the bare status change, without refund details', async () => {
    const { service, queue } = build();
    await service.onStatusChanged({ errandId: 'e-1', status: ErrandStatus.EXPIRED, actor: 'system' });
    expect(queue.add).not.toHaveBeenCalled();
    await service.onExpired({ errandId: 'e-1', refundReviewOpened: true });
    expect(queue.add).toHaveBeenCalledWith(FEED_JOB, {
      kind: 'errand_status',
      errandId: 'e-1',
      status: ErrandStatus.EXPIRED,
    });
  });
});

describe('NotificationsService queue fan-out (row 26)', () => {
  it('only enqueues on a status change (no inline write)', async () => {
    const { service, queue, notifications } = build();
    await service.onStatusChanged({ errandId: 'e-1', status: ErrandStatus.RUNNER_EN_ROUTE, actor: 'runner' });
    expect(queue.add).toHaveBeenCalledWith(FEED_JOB, {
      kind: 'errand_status',
      errandId: 'e-1',
      status: ErrandStatus.RUNNER_EN_ROUTE,
    });
    expect(notifications.save).not.toHaveBeenCalled();
  });

  it('sends the customer nothing on RUNNER_ASSIGNED; "Runner assigned" once accepted (rows 182-184)', async () => {
    const { service, queue } = build();
    await service.onStatusChanged({ errandId: 'e-1', status: ErrandStatus.RUNNER_ASSIGNED, actor: 'admin' });
    expect(queue.add).not.toHaveBeenCalled();
    expect(copyFor({ kind: 'errand_status', errandId: 'e', status: ErrandStatus.RUNNER_ASSIGNED })).toBeNull();
    expect(copyFor({ kind: 'errand_status', errandId: 'e', status: ErrandStatus.RUNNER_EN_ROUTE })).toEqual({
      eventType: 'errand.RUNNER_EN_ROUTE',
      title: 'Runner assigned',
      body: 'A runner accepted your task and is on the way.',
    });
  });

  it('queues a refund feed job unless the change is admin-only (AQ-9, row 100)', async () => {
    const { service, queue } = build();
    const base = { errandId: 'e-1', refundId: 'r-1', status: 'refunded', refundAmount: '400.00' };
    await service.onRefundUpdated({ ...base, notifyCustomer: false });
    expect(queue.add).not.toHaveBeenCalled();
    await service.onRefundUpdated({ ...base, notifyCustomer: true });
    await service.onRefundUpdated(base);
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenCalledWith(FEED_JOB, expect.objectContaining({ kind: 'refund', status: 'refunded' }));
  });

  it('enqueues nothing for an unpublished status', async () => {
    const { service, queue } = build();
    await service.onStatusChanged({ errandId: 'e-1', status: ErrandStatus.PAYMENT_CONFIRMED, actor: 'system' });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('feed job writes the row for the owner and queues one push job per row', async () => {
    const { service, notifications, queue } = build();
    await service.deliverFeed({ kind: 'errand_status', errandId: 'e-1', status: ErrandStatus.RUNNER_EN_ROUTE });
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-1',
        errandId: 'e-1',
        eventType: NotificationEventType.ERRAND_RUNNER_EN_ROUTE,
      }),
    );
    expect(queue.add).toHaveBeenCalledWith(PUSH_JOB, { notificationId: 'n-1' }, { jobId: 'push-n-1' });
  });

  it('skips the push job when FCM is not configured', async () => {
    const { service, queue } = build({ pushEnabled: false });
    await service.deliverFeed({ kind: 'errand_status', errandId: 'e-1', status: ErrandStatus.ARRIVED });
    expect(queue.add).not.toHaveBeenCalled();
  });
});

describe('NotificationsService.deliverPush (row 31)', () => {
  it('sends to every device token with deep-link data and logs SENT', async () => {
    const { service, push, logs } = build({ tokens: ['tok-1', 'tok-2'] });
    await service.deliverPush('n-1');
    expect(push.send).toHaveBeenCalledWith({
      tokens: ['tok-1', 'tok-2'],
      title: 'Runner assigned',
      body: 'b',
      data: { eventType: 'errand.RUNNER_ASSIGNED', errandId: 'e-1', notificationId: 'n-1' },
    });
    expect(logs.create).toHaveBeenCalledWith(expect.objectContaining({ status: NotificationSendStatus.SENT }));
  });

  it('drops stale tokens without retrying', async () => {
    const { service, devices } = build({
      results: [{ token: 'tok-1', ok: false, stale: true, errorCode: 'messaging/registration-token-not-registered' }],
    });
    await expect(service.deliverPush('n-1')).resolves.toBeUndefined();
    expect(devices.removeStaleTokens).toHaveBeenCalledWith(['tok-1']);
  });

  it('throws for BullMQ to retry when every token failed transiently', async () => {
    const { service, logs } = build({
      results: [{ token: 'tok-1', ok: false, stale: false, errorCode: 'messaging/internal-error' }],
    });
    await expect(service.deliverPush('n-1')).rejects.toThrow(/retrying/);
    expect(logs.create).toHaveBeenCalledWith(expect.objectContaining({ status: NotificationSendStatus.FAILED }));
  });

  it('is a no-op without FCM credentials', async () => {
    const { service, push } = build({ pushEnabled: false });
    await service.deliverPush('n-1');
    expect(push.send).not.toHaveBeenCalled();
  });
});

describe('Re-quote and merchant-details notifications (N-4, rows 42-44)', () => {
  it('enqueues a quote_reissued feed job (never an inline write)', async () => {
    const { service, queue, notifications } = build();
    await service.onQuoteReissued({
      errandId: 'e-1',
      quoteId: 'q-2',
      total: '700.00',
      currency: 'KES',
      expiresAt: null,
      status: ErrandStatus.ACCEPTED,
      acceptanceRequired: true,
    });
    expect(queue.add).toHaveBeenCalledWith(FEED_JOB, {
      kind: 'quote_reissued',
      errandId: 'e-1',
      quoteId: 'q-2',
      total: '700.00',
      expiresAt: null,
      acceptanceRequired: true,
    });
    expect(notifications.save).not.toHaveBeenCalled();
  });

  it('enqueues a merchant_details feed job', async () => {
    const { service, queue } = build();
    await service.onMerchantDetails({
      errandId: 'e-1',
      merchantName: 'Naivas Nyali',
      tillNumber: '123456',
      paybillNumber: null,
      accountReference: null,
      changed: false,
      merchantDetailsUpdatedAt: null,
    });
    expect(queue.add).toHaveBeenCalledWith(FEED_JOB, {
      kind: 'merchant_details',
      errandId: 'e-1',
      merchantName: 'Naivas Nyali',
    });
  });

  it('has copy for both', () => {
    expect(
      copyFor({
        kind: 'quote_reissued',
        errandId: 'e',
        quoteId: 'q',
        total: '700.00',
        expiresAt: null,
        acceptanceRequired: true,
      }),
    ).toMatchObject({ eventType: 'quote.reissued', body: expect.stringContaining('Accept it') });
    expect(copyFor({ kind: 'merchant_details', errandId: 'e', merchantName: null })).toMatchObject({
      eventType: 'merchant_details.added',
    });
  });
});

describe('Quote request admin feed (row 68)', () => {
  it('queues a quote_requested job on the domain event (no inline write)', async () => {
    const { service, queue, notifications } = build();
    await service.onQuoteRequested({
      errandId: 'e-1',
      reference: 'NT-10001',
      quoteId: 'q-1',
      status: ErrandStatus.QUOTED,
      quoteRequestedAt: '2026-10-09T10:00:00.000Z',
    });
    expect(queue.add).toHaveBeenCalledWith(FEED_JOB, {
      kind: 'quote_requested',
      errandId: 'e-1',
      reference: 'NT-10001',
    });
    expect(notifications.save).not.toHaveBeenCalled();
  });

  it('writes one feed row per active admin, never to the customer', async () => {
    const { service, notifications, queue, customers } = build();
    const first = await service.deliverFeed({
      kind: 'quote_requested',
      errandId: 'e-1',
      reference: 'NT-10001',
    });
    expect(first).not.toBeNull();
    expect(customers.findOne).not.toHaveBeenCalled();
    expect(notifications.save).toHaveBeenCalledTimes(2);
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-1',
        errandId: 'e-1',
        eventType: 'quote.requested',
        title: 'New quote requested',
        body: expect.stringContaining('NT-10001'),
      }),
    );
    expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'admin-2' }));
    expect(queue.add).toHaveBeenCalledTimes(2);
  });

  it('writes nothing when there is no active admin', async () => {
    const { service, notifications } = build({ admins: [] });
    expect(
      await service.deliverFeed({ kind: 'quote_requested', errandId: 'e-1', reference: 'NT-10001' }),
    ).toBeNull();
    expect(notifications.save).not.toHaveBeenCalled();
  });
});

describe('Merchant details changed after a merchant-direct payment (row 80)', () => {
  it('does not send the "added" item for a change of existing details', async () => {
    const { service, queue } = build();
    await service.onMerchantDetails({
      errandId: 'e-1',
      merchantName: 'Naivas',
      tillNumber: '654321',
      paybillNumber: null,
      accountReference: null,
      changed: true,
      merchantDetailsUpdatedAt: '2026-10-09T10:00:00.000Z',
    });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('queues a merchant_details_changed item for the customer', async () => {
    const { service, queue } = build();
    await service.onMerchantDetailsChanged({
      errandId: 'e-1',
      merchantName: 'Naivas',
      tillNumber: '654321',
      paybillNumber: null,
      accountReference: null,
      merchantDetailsUpdatedAt: '2026-10-09T10:00:00.000Z',
    });
    expect(queue.add).toHaveBeenCalledWith(FEED_JOB, {
      kind: 'merchant_details_changed',
      errandId: 'e-1',
      merchantName: 'Naivas',
    });
    expect(
      copyFor({ kind: 'merchant_details_changed', errandId: 'e-1', merchantName: 'Naivas' }),
    ).toMatchObject({
      eventType: 'merchant_details.changed',
      title: 'Merchant payment details changed',
      body: expect.stringContaining('Naivas'),
    });
  });
});

describe('assignment_declined admin feed (row 108)', () => {
  it('has admin copy with the task reference', async () => {
    const { copyFor } = await import('./notifications.service');
    expect(copyFor({ kind: 'assignment_declined', errandId: 'e-1', reference: 'NT-7' })).toEqual({
      eventType: 'assignment.declined',
      title: 'Runner declined a task',
      body: 'The runner declined NT-7: the purchase is above their limit. Assign another runner.',
    });
  });

  it('a decline without the over-limit reason does not mention the limit (row 113)', async () => {
    const { copyFor } = await import('./notifications.service');
    expect(copyFor({ kind: 'assignment_declined', errandId: 'e-1', reference: 'NT-7', overPurchaseLimit: false })).toMatchObject({
      body: 'The runner declined NT-7. Assign another runner.',
    });
  });
});

describe('assignment_expired admin feed (row 157, N-20)', () => {
  it('has admin copy with the task reference', () => {
    expect(copyFor({ kind: 'assignment_expired', errandId: 'e-1', reference: 'NT-7' })).toEqual({
      eventType: 'assignment.expired',
      title: 'Offer ended',
      body: "The runner didn't accept NT-7 in time. Offer it to another runner.",
    });
  });

  it('is queued from assignment.expired, never as a customer status item', async () => {
    const { service, queue } = build();
    await service.onAssignmentExpired({
      errandId: 'e-1',
      reference: 'NT-7',
      assignmentId: 'a-1',
      runnerProfileId: 'rp-1',
      offerExpiresAt: '2026-10-16T10:00:00.000Z',
    });
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledWith(FEED_JOB, { kind: 'assignment_expired', errandId: 'e-1', reference: 'NT-7' });
  });
});
