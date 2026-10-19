import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import type { Queue } from 'bullmq';
import { IsNull, Repository } from 'typeorm';
import {
  AssignmentDeclineReason,
  AssignmentStatus,
  ErrandCategory,
  ErrandStatus,
  NotificationChannel,
  NotificationEventType,
  NotificationSendStatus,
} from '../common/enums';
import { Errand } from '../errands/errand.entity';
import { CustomerProfile } from '../customers/customer-profile.entity';
import { NOTIFICATIONS_QUEUE } from '../infra/queue/queues';
import { BUDGET_CATEGORIES } from '../errands/errand-rules';
import { ErrandsService } from '../errands/errands.service';
import { MerchantRoute } from '../payments/payment-views';
import { PaymentsService } from '../payments/payments.service';
import { RunnersService } from '../runners/runners.service';
import { DevicesService } from '../users/devices.service';
import { UsersService } from '../users/users.service';
import {
  ASSIGNMENT_DECLINED_EVENT,
  TASK_DEADLINE_EXPIRED_EVENT,
  PAID_TASK_DEADLINE_PASSED_EVENT,
  PaidTaskDeadlinePassedEvent,
  OUTSIDE_SERVICE_AREA_EVENT,
  OutsideServiceAreaEvent,
  TaskDeadlineExpiredEvent,
  ASSIGNMENT_EXPIRED_EVENT,
  AssignmentDeclinedEvent,
  AssignmentExpiredEvent,
  MERCHANT_DETAILS_UPDATED_EVENT,
  MerchantDetailsUpdatedEvent,
  QUOTE_REISSUED_EVENT,
  QUOTE_REQUESTED_EVENT,
  QuoteReissuedEvent,
  QuoteRequestedEvent,
} from '../errands/errands.service';
import {
  ERRAND_EXPIRED_EVENT,
  ErrandExpiredEvent,
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
  | {
      kind: 'errand_status';
      errandId: string;
      status: ErrandStatus;
    }
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
  | { kind: 'assignment_declined'; errandId: string; reference: string; overPurchaseLimit?: boolean }
  /** Admin-facing (row 157): an admin offer lapsed; the task needs another runner. */
  | { kind: 'assignment_expired'; errandId: string; reference: string }
  /** Admin-facing (row 185): a RUNNER_ASSIGNED task expired at its customer deadline. */
  | { kind: 'deadline_passed'; errandId: string; reference: string }
  /** Admin-facing (rows 201, 220): a PAYMENT_CONFIRMED task is past its deadline; not expired. Once per task. */
  | { kind: 'paid_deadline_passed'; errandId: string; reference: string }
  /** Customer (row 236): the quote was refused, the task is inside no service area. Once per task. */
  | { kind: 'outside_service_area'; errandId: string; reference: string }
  /** Runner (RA-6, row 139): to the runner holding the accepted job. */
  | { kind: 'runner_job'; errandId: string; event: RunnerJobEvent; toPrice?: string };

/** RA-6 / A9: the job events a runner is told about (`v-notifications.md`, final copy). */
export type RunnerJobEvent =
  | 'cancelled'
  | 'failed'
  | 'confirmed'
  | 'disputed'
  | 'dispute_resolved'
  | 'price_change_approved'
  | 'price_change_rejected';

/** `_shared.md` §7: display names for `{task}` when the task has no title. */
const CATEGORY_DISPLAY: Record<ErrandCategory, string> = {
  [ErrandCategory.BUY_FOR_ME]: 'Buy For Me',
  [ErrandCategory.PICKUP_DELIVERY]: 'Get It For Me',
  [ErrandCategory.INSPECTION]: 'Check It For Me',
  [ErrandCategory.REPRESENTATION]: 'Go There For Me',
  [ErrandCategory.QUEUE_ADMIN]: 'Wait For Me',
  [ErrandCategory.BUSINESS]: 'Business Tasks',
};

/**
 * Runner copy, word for word from `v-notifications.md` (row 139). Titles
 * are exact (row 188). `itemBought`: `send_to_runner` with an item amount
 * (the row-129 receipt sentence).
 */
export const runnerJobCopy = (
  event: RunnerJobEvent,
  ctx: { task: string; itemBought: boolean; toPrice?: string },
): FeedCopy => {
  const receipt = ctx.itemBought ? ' If you already bought the item, upload the receipt within 24 hours.' : '';
  switch (event) {
    case 'cancelled':
      return {
        eventType: NotificationEventType.ERRAND_CANCELLED,
        title: 'Job cancelled',
        body: `${ctx.task} was cancelled, so there's no runner fee.${receipt}`,
      };
    case 'failed':
      return {
        eventType: NotificationEventType.ERRAND_FAILED,
        title: 'Job ended as failed',
        body: `${ctx.task} ended as failed, so there's no runner fee.${receipt}`,
      };
    case 'confirmed':
      return {
        eventType: NotificationEventType.ERRAND_COMPLETED,
        title: 'Customer confirmed the job',
        body: `${ctx.task}. Your runner fee becomes payable when the review window closes.`,
      };
    case 'disputed':
      return {
        eventType: NotificationEventType.ERRAND_DISPUTED,
        title: 'Customer reported a problem',
        body: `Our team is reviewing ${ctx.task}. We'll tell you the outcome.`,
      };
    case 'dispute_resolved':
      return {
        eventType: NotificationEventType.DISPUTE_RESOLVED,
        title: 'Problem resolved',
        body: `Our team has decided on ${ctx.task}. Open the job to see the outcome.`,
      };
    case 'price_change_approved':
      return {
        eventType: NotificationEventType.PRICE_CHANGE_APPROVED,
        title: 'Price change approved',
        body: `New item amount for ${ctx.task}: ${formatKsh(ctx.toPrice)}.`,
      };
    case 'price_change_rejected':
      return {
        eventType: NotificationEventType.PRICE_CHANGE_REJECTED,
        title: 'Price change not approved',
        body: `Continue ${ctx.task} at the original amount, or contact support.`,
      };
  }
};

/**
 * RA-6: the runner event for a status change, or null. Never the runner's
 * own transitions (`v-notifications.md`), never before an accept.
 */
export const runnerEventFor = (event: { status: ErrandStatus; from?: ErrandStatus | null; actor: string }): RunnerJobEvent | null => {
  if (event.actor === 'runner') {
    return null;
  }
  switch (event.status) {
    case ErrandStatus.CANCELLED:
      return event.from === ErrandStatus.DISPUTED ? 'dispute_resolved' : 'cancelled';
    case ErrandStatus.FAILED:
      return 'failed';
    case ErrandStatus.COMPLETED:
      return event.from === ErrandStatus.DISPUTED ? 'dispute_resolved' : 'confirmed';
    case ErrandStatus.DISPUTED:
      return 'disputed';
    default:
      return null;
  }
};

/** Feed jobs whose recipients are the admins, not the errand's customer. */
const ADMIN_FEED_KINDS = new Set<FeedJob['kind']>([
  'quote_requested',
  'assignment_declined',
  'assignment_expired',
  'deadline_passed',
  'paid_deadline_passed',
]);

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
    @Optional() private readonly errandsService?: ErrandsService,
    @Optional() private readonly runners?: RunnersService,
    @Optional() private readonly payments?: PaymentsService,
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
    // RA-6: the runner's own item (the worker finds the runner who accepted).
    const runnerEvent = runnerEventFor(event);
    if (runnerEvent) {
      await this.enqueue({ kind: 'runner_job', errandId: event.errandId, event: runnerEvent });
    }
    // EXPIRED is queued from `errand.expired`, once the refund review is known.
    // Statuses without customer copy (RUNNER_ASSIGNED, rows 182, 183) send nothing.
    if (!notificationEventTypeFor(event.status) || event.status === ErrandStatus.EXPIRED || !statusCopy(event.status)) {
      return;
    }
    await this.enqueue({ kind: 'errand_status', errandId: event.errandId, status: event.status });
  }

  /**
   * RUNNER_ASSIGNED -> EXPIRED: the customer's feed item + push, queued once
   * the payments module has run its refund backstop for the task. The copy
   * never mentions the refund review (row 158): refund wording is only for a
   * refund the refund flow has already found due (refund.approved).
   */
  @OnEvent(ERRAND_EXPIRED_EVENT, { async: true })
  async onExpired(event: ErrandExpiredEvent): Promise<void> {
    await this.enqueue({ kind: 'errand_status', errandId: event.errandId, status: ErrandStatus.EXPIRED });
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

  /**
   * RA-6: price change decided -> the runner. A customer reject cancels the
   * task (`cancelled`), told through the status change instead.
   */
  @OnEvent('price_change.decided', { async: true })
  async onPriceChangeDecided(event: { errandId: string; outcome: string; toPrice: string }): Promise<void> {
    if (event.outcome === 'approved' || event.outcome === 'rejected') {
      await this.enqueue({
        kind: 'runner_job',
        errandId: event.errandId,
        event: event.outcome === 'approved' ? 'price_change_approved' : 'price_change_rejected',
        toPrice: event.toPrice,
      });
    }
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

  /**
   * Runner declined -> admin feed (rows 108, 216, 231). Only
   * `over_purchase_limit` gets the limit body; `too_far`, `not_available`,
   * `other` (and older declines without a reason) get the plain body.
   */
  @OnEvent(ASSIGNMENT_DECLINED_EVENT, { async: true })
  async onAssignmentDeclined(event: AssignmentDeclinedEvent): Promise<void> {
    await this.enqueue({
      kind: 'assignment_declined',
      errandId: event.errandId,
      reference: event.reference,
      overPurchaseLimit: event.reason === AssignmentDeclineReason.OVER_PURCHASE_LIMIT,
    });
  }

  /**
   * Admin offer lapsed (row 157) -> admin feed (N-20). The customer gets
   * nothing: the task is still RUNNER_ASSIGNED.
   */
  @OnEvent(ASSIGNMENT_EXPIRED_EVENT, { async: true })
  async onAssignmentExpired(event: AssignmentExpiredEvent): Promise<void> {
    await this.enqueue({ kind: 'assignment_expired', errandId: event.errandId, reference: event.reference });
  }

  /**
   * Row 185: the task expired at its deadline -> admin feed `deadline_passed`.
   * The customer's `errand.EXPIRED` comes from the status change as usual.
   */
  @OnEvent(TASK_DEADLINE_EXPIRED_EVENT, { async: true })
  async onTaskDeadlineExpired(event: TaskDeadlineExpiredEvent): Promise<void> {
    await this.enqueue({ kind: 'deadline_passed', errandId: event.errandId, reference: event.reference });
  }

  /**
   * Rows 201, 220: a PAYMENT_CONFIRMED task past its deadline -> one admin
   * feed item `deadline_passed` per task, ever. The sweep reports the task
   * on every run; it is queued only while no such item exists, under a
   * per-task job id (a second report while one is queued is dropped), and
   * the worker checks again before writing.
   */
  @OnEvent(PAID_TASK_DEADLINE_PASSED_EVENT, { async: true })
  async onPaidTaskDeadlinePassed(event: PaidTaskDeadlinePassedEvent): Promise<void> {
    if (await this.hasDeadlineItem(event.errandId)) {
      return;
    }
    await this.enqueue(
      { kind: 'paid_deadline_passed', errandId: event.errandId, reference: event.reference },
      `paid-deadline-passed-${event.errandId}`,
    );
  }

  /**
   * Row 236: a quote was refused because the task is inside no service area
   * -> the customer's feed item + push, once per task (an admin may retry
   * the quote). Queued under a per-task job id; the worker checks again.
   */
  @OnEvent(OUTSIDE_SERVICE_AREA_EVENT, { async: true })
  async onOutsideServiceArea(event: OutsideServiceAreaEvent): Promise<void> {
    if (await this.hasItem(event.errandId, NotificationEventType.OUTSIDE_SERVICE_AREA)) {
      return;
    }
    await this.enqueue(
      { kind: 'outside_service_area', errandId: event.errandId, reference: event.reference },
      `outside-service-area-${event.errandId}`,
    );
  }

  private hasItem(errandId: string, eventType: NotificationEventType): Promise<boolean> {
    return this.notifications.exists({ where: { errandId, eventType } });
  }

  private hasDeadlineItem(errandId: string): Promise<boolean> {
    return this.notifications.exists({ where: { errandId, eventType: NotificationEventType.DEADLINE_PASSED } });
  }

  private async enqueue(job: FeedJob, jobId?: string): Promise<void> {
    try {
      await this.queue.add(FEED_JOB, job, ...(jobId ? [{ jobId }] : []));
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
    if (job.kind === 'runner_job') {
      return this.deliverRunnerFeed(job);
    }
    const copy = copyFor(job);
    if (!copy) {
      return null;
    }
    const errand = await this.errands.findOne({ where: { id: job.errandId } });
    if (!errand) {
      return null;
    }
    if (job.kind === 'paid_deadline_passed' && (await this.hasDeadlineItem(errand.id))) {
      return null; // Rows 201, 220: once per task.
    }
    if (job.kind === 'outside_service_area' && (await this.hasItem(errand.id, NotificationEventType.OUTSIDE_SERVICE_AREA))) {
      return null; // Row 236: once per task.
    }
    let recipients: string[];
    if (ADMIN_FEED_KINDS.has(job.kind)) {
      recipients = this.users ? await this.users.activeAdminIds() : [];
    } else {
      const profile = await this.customers.findOne({ where: { id: errand.customerId } });
      recipients = profile ? [profile.userId] : [];
    }
    return this.writeFeed(recipients, errand.id, copy);
  }

  /**
   * RA-6: one feed row (+ push) for the runner on the job's accepted
   * assignment; nothing when no runner accepted it (row 197).
   */
  private async deliverRunnerFeed(job: Extract<FeedJob, { kind: 'runner_job' }>): Promise<AppNotification | null> {
    if (!this.errandsService || !this.runners) {
      return null;
    }
    const errand = await this.errands.findOne({ where: { id: job.errandId } });
    const holder = errand ? await this.errandsService.activeAssignmentFor(errand.id) : null;
    if (!errand || holder?.status !== AssignmentStatus.ACCEPTED) {
      return null;
    }
    const runner = await this.runners.profileById(holder.runnerProfileId);
    const hasItem = BUDGET_CATEGORIES.has(errand.category) && Number(errand.budget ?? 0) > 0;
    const itemBought =
      (job.event === 'cancelled' || job.event === 'failed') &&
      hasItem &&
      (await this.payments?.primaryRouteFor(errand.id)) === MerchantRoute.SEND_TO_RUNNER;
    const task = errand.title?.trim() || CATEGORY_DISPLAY[errand.category] || 'Your job';
    const copy = runnerJobCopy(job.event, { task, itemBought, toPrice: job.toPrice });
    return this.writeFeed([runner.userId], errand.id, copy);
  }

  private async writeFeed(recipients: string[], errandId: string, copy: FeedCopy): Promise<AppNotification | null> {
    let first: AppNotification | null = null;
    for (const userId of recipients) {
      const row = await this.notifications.save(
        this.notifications.create({
          userId,
          errandId,
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
        ? { eventType, title: copy.exactTitle ? copy.title : `${copy.title} · ${humanStatus(job.status)}`, body: copy.body }
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
        // Owner copy: limit body (row 108); plain body (rows 216, 231). Jobs
        // queued before the general decline (row 113) carry no flag: they
        // were all over the limit.
        body:
          job.overPurchaseLimit === false
            ? `The runner declined ${job.reference}. Assign another runner.`
            : `The runner declined ${job.reference}: the purchase is above their limit. Assign another runner.`,
      };
    case 'deadline_passed':
      return {
        eventType: NotificationEventType.DEADLINE_PASSED,
        title: 'Deadline passed',
        body: `The customer's deadline for ${job.reference} passed before any runner accepted. The task has expired.`,
      };
    // Row 236; owner copy, row 241.
    // Written by deliverRunnerFeed (needs the errand and the runner).
    case 'runner_job':
      return null;
    case 'outside_service_area':
      return {
        eventType: NotificationEventType.OUTSIDE_SERVICE_AREA,
        title: "We can't take this task",
        body: "Its location is outside the areas we serve. You can cancel it; you haven't paid anything.",
      };
    // Owner copy, row 220 (the task has not expired, so row 216's body does not fit).
    case 'paid_deadline_passed':
      return {
        eventType: NotificationEventType.DEADLINE_PASSED,
        title: 'Deadline passed',
        body: `The customer's deadline for ${job.reference} passed before a runner was assigned. Expire the task or contact the customer.`,
      };
    case 'assignment_expired':
      return {
        eventType: NotificationEventType.ASSIGNMENT_EXPIRED,
        title: 'Offer ended',
        body: `The runner didn't accept ${job.reference} in time. Offer it to another runner.`,
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

/**
 * Customer copy per status. Titles get the " · {Status}" suffix unless
 * `exactTitle` (row 188: the owner set "No runner available" and "Runner
 * assigned" exactly; the other titles keep the builder pattern).
 */
const statusCopy = (status: ErrandStatus): { title: string; body: string; exactTitle?: boolean } | null => {
  switch (status) {
    case ErrandStatus.EXPIRED:
      // Owner wording, row 158. No refund sentence: an opened refund review
      // is not a refund found due. Title kept from the round-8 builder.
      return {
        title: 'No runner available',
        exactTitle: true,
        body: 'Your task has expired because no runner was available to accept it within the required time. You can submit a new request if you still need this service.',
      };
    case ErrandStatus.QUOTED:
      return { title: 'Your task has a quote', body: 'A runner can now accept your task. Review the price to continue.' };
    // Rows 182, 184 (owner, 2026-10-16): nothing on RUNNER_ASSIGNED (only an
    // offer exists, row 183); "Runner assigned" once the runner accepts.
    case ErrandStatus.RUNNER_EN_ROUTE:
      return { title: 'Runner assigned', body: 'A runner accepted your task and is on the way.', exactTitle: true };
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
