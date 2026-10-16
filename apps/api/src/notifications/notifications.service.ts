import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import type { Queue } from 'bullmq';
import { IsNull, Repository } from 'typeorm';
import {
  ErrandStatus,
  NotificationChannel,
  NotificationEventType,
  NotificationSendStatus,
} from '../common/enums';
import { Errand } from '../errands/errand.entity';
import { CustomerProfile } from '../customers/customer-profile.entity';
import { NOTIFICATIONS_QUEUE } from '../infra/queue/queues';
import { DevicesService } from '../users/devices.service';
import { UsersService } from '../users/users.service';
import {
  ASSIGNMENT_DECLINED_EVENT,
  AssignmentDeclinedEvent,
  MERCHANT_DETAILS_UPDATED_EVENT,
  MerchantDetailsUpdatedEvent,
  QUOTE_REISSUED_EVENT,
  QUOTE_REQUESTED_EVENT,
  QuoteReissuedEvent,
  QuoteRequestedEvent,
} from '../errands/errands.service';
import {
  MERCHANT_DETAILS_CHANGED_EVENT,
  MerchantDetailsChangedEvent,
} from '../payments/payment-events';
import { AppNotification } from './app-notification.entity';
import { NotificationLog } from './notification-log.entity';
import { PUSH_SENDER, PushSender } from './push/push-sender';

export const ERrandStatusChangedEvent = 'errand.status_changed';

export interface StatusChangedEvent {
  errandId: string;
  status: ErrandStatus;
  from?: ErrandStatus | null;
  actor: string;
}

/** Emitted by the payments module when a refund review changes (row 54). */
export interface RefundUpdatedEvent {
  errandId: string;
  refundId: string;
  status: string;
  refundAmount: string | null;
  /**
   * False for changes that only refresh admin views without telling the
   * customer (payout corrections and reversals, AQ-9 default). Absent = true.
   */
  notifyCustomer?: boolean;
}

interface PriceChangeRequested {
  errandId: string;
  requestId: string;
  fromPrice: string;
  toPrice: string;
}

/** Payload of a `feed` job: one customer-facing feed item to write. */
export type FeedJob =
  | { kind: 'errand_status'; errandId: string; status: ErrandStatus }
  | { kind: 'price_change'; errandId: string; requestId: string; fromPrice: string; toPrice: string }
  | { kind: 'refund'; errandId: string; refundId: string; status: string; refundAmount: string | null }
  | {
      kind: 'quote_reissued';
      errandId: string;
      quoteId: string;
      total: string;
      expiresAt: string | null;
      acceptanceRequired: boolean;
    }
  | { kind: 'merchant_details'; errandId: string; merchantName: string | null }
  | { kind: 'merchant_details_changed'; errandId: string; merchantName: string | null }
  /** Admin-facing (row 68): written to every active admin's feed. */
  | { kind: 'quote_requested'; errandId: string; reference: string }
  /** Admin-facing (row 108): the runner declined; the task needs another runner. */
  | { kind: 'assignment_declined'; errandId: string; reference: string };

/** Feed jobs whose recipients are the admins, not the errand's customer. */
const ADMIN_FEED_KINDS = new Set<FeedJob['kind']>(['quote_requested', 'assignment_declined']);

export const FEED_JOB = 'feed';
export const PUSH_JOB = 'push';

interface FeedCopy {
  eventType: NotificationEventType;
  title: string;
  body: string;
}

/**
 * Notification fan-out (§4.4, row 26). Domain events only enqueue a job on
 * the `notifications` BullMQ queue; the worker (NotificationsProcessor)
 * writes the in-app feed row and then queues a push job, so a failed push is
 * retried on its own without writing the feed item twice. Push goes through
 * FCM when configured (row 31), otherwise it is skipped.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(AppNotification)
    private readonly notifications: Repository<AppNotification>,
    @InjectRepository(Errand)
    private readonly errands: Repository<Errand>,
    @InjectRepository(CustomerProfile)
    private readonly customers: Repository<CustomerProfile>,
    @InjectRepository(NotificationLog)
    private readonly logs: Repository<NotificationLog>,
    @InjectQueue(NOTIFICATIONS_QUEUE)
    private readonly queue: Queue,
    private readonly devices: DevicesService,
    @Inject(PUSH_SENDER)
    private readonly push: PushSender,
    private readonly users?: UsersService,
  ) {}

  async listForUser(
    userId: string,
    limit?: number,
  ): Promise<{ items: AppNotification[]; unread: number }> {
    const cap = Math.min(Math.max(limit ?? 30, 1), 100);
    const [items, unread] = await Promise.all([
      this.notifications.find({
        where: { userId },
        order: { createdAt: 'DESC' },
        take: cap,
      }),
      this.notifications.countBy({ userId, readAt: IsNull() }),
    ]);
    return { items, unread };
  }

  async markRead(userId: string, id: string): Promise<AppNotification> {
    const row = await this.notifications.findOne({ where: { id, userId } });
    if (!row) {
      throw new NotFoundException('Notification not found');
    }
    if (!row.readAt) {
      row.readAt = new Date();
      await this.notifications.save(row);
    }
    return row;
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.notifications.update(
      { userId, readAt: IsNull() },
      { readAt: new Date() },
    );
    return { updated: result.affected ?? 0 };
  }

  /** Errand status change -> queued feed item (published statuses only). */
  @OnEvent(ERrandStatusChangedEvent, { async: true })
  async onStatusChanged(event: StatusChangedEvent): Promise<void> {
    if (!notificationEventTypeFor(event.status)) {
      return;
    }
    await this.enqueue({ kind: 'errand_status', errandId: event.errandId, status: event.status });
  }

  @OnEvent('price_change.requested', { async: true })
  async onPriceChangeRequested(event: PriceChangeRequested): Promise<void> {
    await this.enqueue({
      kind: 'price_change',
      errandId: event.errandId,
      requestId: event.requestId,
      fromPrice: event.fromPrice,
      toPrice: event.toPrice,
    });
  }

  @OnEvent('refund.updated', { async: true })
  async onRefundUpdated(event: RefundUpdatedEvent): Promise<void> {
    if (event.notifyCustomer === false || !refundCopy(event.status, event.refundAmount)) {
      return;
    }
    await this.enqueue({
      kind: 'refund',
      errandId: event.errandId,
      refundId: event.refundId,
      status: event.status,
      refundAmount: event.refundAmount,
    });
  }

  /** Admin re-quote -> the customer must review (and, on ACCEPTED, accept) it. */
  @OnEvent(QUOTE_REISSUED_EVENT, { async: true })
  async onQuoteReissued(event: QuoteReissuedEvent): Promise<void> {
    await this.enqueue({
      kind: 'quote_reissued',
      errandId: event.errandId,
      quoteId: event.quoteId,
      total: event.total,
      expiresAt: event.expiresAt,
      acceptanceRequired: event.acceptanceRequired,
    });
  }

  /** Merchant Till/Paybill details added -> merchant_direct is now possible. */
  @OnEvent(MERCHANT_DETAILS_UPDATED_EVENT, { async: true })
  async onMerchantDetails(event: MerchantDetailsUpdatedEvent): Promise<void> {
    // A change of existing details is announced only when a merchant-direct
    // payment has started (merchant_details.changed, row 80).
    if (event.changed) {
      return;
    }
    await this.enqueue({
      kind: 'merchant_details',
      errandId: event.errandId,
      merchantName: event.merchantName,
    });
  }

  /** Details changed after a merchant-direct payment started -> warn the customer (row 80). */
  @OnEvent(MERCHANT_DETAILS_CHANGED_EVENT, { async: true })
  async onMerchantDetailsChanged(event: MerchantDetailsChangedEvent): Promise<void> {
    await this.enqueue({
      kind: 'merchant_details_changed',
      errandId: event.errandId,
      merchantName: event.merchantName,
    });
  }

  /** Customer asked for a new quote -> admin feed (row 68). */
  @OnEvent(QUOTE_REQUESTED_EVENT, { async: true })
  async onQuoteRequested(event: QuoteRequestedEvent): Promise<void> {
    await this.enqueue({
      kind: 'quote_requested',
      errandId: event.errandId,
      reference: event.reference,
    });
  }

  /** Runner declined over their purchase limit -> admin feed (row 108). */
  @OnEvent(ASSIGNMENT_DECLINED_EVENT, { async: true })
  async onAssignmentDeclined(event: AssignmentDeclinedEvent): Promise<void> {
    await this.enqueue({ kind: 'assignment_declined', errandId: event.errandId, reference: event.reference });
  }

  private async enqueue(job: FeedJob): Promise<void> {
    try {
      await this.queue.add(FEED_JOB, job);
    } catch (err) {
      // Never fail the request that emitted the event; the feed is not money.
      this.logger.error(
        `Could not queue ${job.kind} notification for ${job.errandId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Worker step 1: writes the feed row of each recipient (the errand's
   * customer, or every active admin for admin kinds), then queues the push.
   * Returns the first row written, or null.
   */
  async deliverFeed(job: FeedJob): Promise<AppNotification | null> {
    const copy = copyFor(job);
    if (!copy) {
      return null;
    }
    const errand = await this.errands.findOne({ where: { id: job.errandId } });
    if (!errand) {
      return null;
    }
    let recipients: string[];
    if (ADMIN_FEED_KINDS.has(job.kind)) {
      recipients = this.users ? await this.users.activeAdminIds() : [];
    } else {
      const profile = await this.customers.findOne({ where: { id: errand.customerId } });
      recipients = profile ? [profile.userId] : [];
    }
    let first: AppNotification | null = null;
    for (const userId of recipients) {
      const row = await this.notifications.save(
        this.notifications.create({
          userId,
          errandId: errand.id,
          eventType: copy.eventType,
          title: copy.title,
          body: copy.body,
        }),
      );
      if (this.push.enabled) {
        await this.queue.add(PUSH_JOB, { notificationId: row.id }, { jobId: `push-${row.id}` });
      }
      first ??= row;
    }
    return first;
  }

  /**
   * Worker step 2: pushes a feed item to every device of its user. Dead
   * tokens are dropped; a send where every token failed for another reason
   * throws so BullMQ retries it with backoff. Every attempt is logged in
   * `notification_log`.
   */
  async deliverPush(notificationId: string): Promise<void> {
    if (!this.push.enabled) {
      return;
    }
    const row = await this.notifications.findOne({ where: { id: notificationId } });
    if (!row) {
      return;
    }
    const tokens = await this.devices.pushTokensFor(row.userId);
    if (tokens.length === 0) {
      return;
    }
    const results = await this.push.send({
      tokens,
      title: row.title,
      body: row.body ?? '',
      data: {
        eventType: row.eventType,
        errandId: row.errandId ?? '',
        notificationId: row.id,
      },
    });
    const stale = results.filter((r) => r.stale).map((r) => r.token);
    if (stale.length > 0) {
      await this.devices.removeStaleTokens(stale);
    }
    const sent = results.some((r) => r.ok);
    await this.logs.save(
      this.logs.create({
        errandId: row.errandId,
        userId: row.userId,
        channel: NotificationChannel.PUSH,
        eventType: row.eventType,
        status: sent ? NotificationSendStatus.SENT : NotificationSendStatus.FAILED,
        providerResponse: { provider: this.push.name, results },
      }),
    );
    const retryable = results.some((r) => !r.ok && !r.stale);
    if (!sent && retryable) {
      throw new Error(`Push failed for notification ${row.id}; retrying`);
    }
  }

  /** Final failure of a push job after every retry. */
  async recordDeadLetter(notificationId: string, reason: string): Promise<void> {
    const row = await this.notifications.findOne({ where: { id: notificationId } });
    await this.logs.save(
      this.logs.create({
        errandId: row?.errandId ?? null,
        userId: row?.userId ?? null,
        channel: NotificationChannel.PUSH,
        eventType: row?.eventType ?? 'unknown',
        status: NotificationSendStatus.DEAD_LETTERED,
        providerResponse: { provider: this.push.name, reason },
      }),
    );
  }
}

const PUBLISHED_EVENT_TYPES = new Set<string>(Object.values(NotificationEventType));

/** Feed event type for a status change, or null when no feed item is sent. */
export const notificationEventTypeFor = (
  status: ErrandStatus,
): NotificationEventType | null => {
  const candidate = `errand.${status}`;
  return PUBLISHED_EVENT_TYPES.has(candidate)
    ? (candidate as NotificationEventType)
    : null;
};

const humanStatus = (s: ErrandStatus): string =>
  s
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

export const copyFor = (job: FeedJob): FeedCopy | null => {
  switch (job.kind) {
    case 'errand_status': {
      const eventType = notificationEventTypeFor(job.status);
      const copy = statusCopy(job.status);
      return eventType && copy
        ? { eventType, title: `${copy.title} · ${humanStatus(job.status)}`, body: copy.body }
        : null;
    }
    case 'price_change':
      return {
        eventType: NotificationEventType.PRICE_CHANGE_REQUESTED,
        title: 'Price change requested',
        body: `Your runner asked to change the item price from ${formatKsh(job.fromPrice)} to ${formatKsh(job.toPrice)}. Review it to continue.`,
      };
    case 'refund':
      return refundCopy(job.status, job.refundAmount);
    case 'quote_reissued':
      return {
        eventType: NotificationEventType.QUOTE_REISSUED,
        title: 'New quote for your task',
        body: job.acceptanceRequired
          ? `Your task has a new quote of ${formatKsh(job.total)}. Accept it to continue to payment.`
          : `Your task has a new quote of ${formatKsh(job.total)}. Review it to continue.`,
      };
    case 'merchant_details_changed':
      return {
        eventType: NotificationEventType.MERCHANT_DETAILS_CHANGED,
        title: 'Merchant payment details changed',
        body: job.merchantName
          ? `The payment details for ${job.merchantName} changed after you started paying. Check the Till or Paybill before you pay.`
          : 'The merchant payment details changed after you started paying. Check the Till or Paybill before you pay.',
      };
    case 'quote_requested':
      return {
        eventType: NotificationEventType.QUOTE_REQUESTED,
        title: 'New quote requested',
        body: `The customer asked for a new quote on ${job.reference} after their quote expired.`,
      };
    case 'assignment_declined':
      return {
        eventType: NotificationEventType.ASSIGNMENT_DECLINED,
        title: 'Runner declined a task',
        body: `The runner declined ${job.reference}: the purchase is above their limit. Assign another runner.`,
      };
    case 'merchant_details':
      return {
        eventType: NotificationEventType.MERCHANT_DETAILS_ADDED,
        title: 'Merchant payment details added',
        body: job.merchantName
          ? `You can now pay ${job.merchantName} directly for the items.`
          : 'You can now pay the merchant directly for the items.',
      };
  }
};

/**
 * App money format (row 82): `KSh 40,000`, `KSh 1,250.50`. Whole amounts
 * drop the decimals; anything else keeps two.
 */
export const formatKsh = (value: string | number | null | undefined): string => {
  const n = Number(value ?? 0);
  const amount = Number.isFinite(n) ? n : 0;
  const whole = Math.round(amount * 100) % 100 === 0;
  return `KSh ${amount.toLocaleString('en-US', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })}`;
};

const refundCopy = (status: string, amount: string | null): FeedCopy | null => {
  switch (status) {
    case 'approved':
      return {
        eventType: NotificationEventType.REFUND_APPROVED,
        title: 'Refund approved',
        body: `A refund of ${formatKsh(amount)} was approved for your task.`,
      };
    case 'no_refund':
      return {
        eventType: NotificationEventType.REFUND_NO_REFUND,
        title: 'Refund review closed',
        body: 'After review, no refund is due for this task.',
      };
    case 'refunded':
      return {
        eventType: NotificationEventType.REFUND_REFUNDED,
        title: 'Refund sent',
        body: `Your refund of ${formatKsh(amount)} has been sent to M-Pesa.`,
      };
    default:
      return null;
  }
};

const statusCopy = (status: ErrandStatus): { title: string; body: string } | null => {
  switch (status) {
    case ErrandStatus.QUOTED:
      return { title: 'Your task has a quote', body: 'A runner can now accept your task. Review the price to continue.' };
    case ErrandStatus.RUNNER_ASSIGNED:
      return { title: 'Runner assigned', body: 'A runner has been assigned to your task.' };
    case ErrandStatus.RUNNER_EN_ROUTE:
      return { title: 'Runner en route', body: 'Your runner is on the way to complete the task.' };
    case ErrandStatus.ARRIVED:
      return { title: 'Runner arrived', body: 'Your runner has reached the location.' };
    case ErrandStatus.IN_PROGRESS:
      return { title: 'Task in progress', body: 'Your runner is working on the task now.' };
    case ErrandStatus.AWAITING_CUSTOMER:
      return { title: 'Ready for your review', body: 'Your runner is waiting for you to confirm the task details.' };
    case ErrandStatus.COMPLETED:
      return { title: 'Task complete', body: 'Your task is complete. Thank you for using Nitume.' };
    case ErrandStatus.DISPUTED:
      return { title: 'Task disputed', body: 'A dispute has been opened on this task and is under review.' };
    case ErrandStatus.CANCELLED:
      return { title: 'Task cancelled', body: 'The task was cancelled.' };
    case ErrandStatus.FAILED:
      return { title: 'Task failed', body: 'The task could not be completed.' };
    default:
      return null;
  }
};
