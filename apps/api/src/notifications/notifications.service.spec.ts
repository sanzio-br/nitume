import { describe, expect, it, vi } from 'vitest';
import { ErrandStatus, NotificationEventType } from '../common/enums';
import {
  NotificationsService,
  notificationEventTypeFor,
} from './notifications.service';

describe('NotificationEventType (A-14)', () => {
  it('maps every published status to `errand.<STATUS>`', () => {
    for (const value of Object.values(NotificationEventType)) {
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
      ErrandStatus.EXPIRED,
      // System-only payout states are never shown to the customer.
      ErrandStatus.CONFIRMED,
      ErrandStatus.SETTLED,
    ]) {
      expect(notificationEventTypeFor(status)).toBeNull();
    }
  });

  it('writes the published event type on the feed row', async () => {
    const notifications = {
      create: vi.fn((row: unknown) => row),
      save: vi.fn((row: unknown) => Promise.resolve(row)),
    };
    const service = new NotificationsService(
      notifications as never,
      { findOne: () => Promise.resolve({ id: 'e-1', customerId: 'c-1' }) } as never,
      { findOne: () => Promise.resolve({ id: 'c-1', userId: 'u-1' }) } as never,
    );

    await service.onStatusChanged({
      errandId: 'e-1',
      status: ErrandStatus.RUNNER_ASSIGNED,
      actor: 'admin',
    });

    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-1',
        errandId: 'e-1',
        eventType: NotificationEventType.ERRAND_RUNNER_ASSIGNED,
      }),
    );
  });

  it('writes nothing for an unpublished status', async () => {
    const notifications = { create: vi.fn(), save: vi.fn() };
    const service = new NotificationsService(
      notifications as never,
      {} as never,
      {} as never,
    );
    await service.onStatusChanged({
      errandId: 'e-1',
      status: ErrandStatus.PAYMENT_CONFIRMED,
      actor: 'system',
    });
    expect(notifications.save).not.toHaveBeenCalled();
  });
});
