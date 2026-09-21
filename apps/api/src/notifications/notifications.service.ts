import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { ErrandStatus } from '../common/enums';
import { Errand } from '../errands/errand.entity';
import { CustomerProfile } from '../customers/customer-profile.entity';
import { AppNotification } from './app-notification.entity';

export const ERrandStatusChangedEvent = 'errand.status_changed';

export interface StatusChangedEvent {
  errandId: string;
  status: ErrandStatus;
  from?: ErrandStatus | null;
  actor: string;
}

interface FeedCopy {
  title: string;
  body: string;
}

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

  /** Turns an errand status change into a customer-facing feed item. */
  @OnEvent(ERrandStatusChangedEvent, { async: true })
  async onStatusChanged(event: StatusChangedEvent): Promise<void> {
    const copy = feedCopy(event.status);
    if (!copy) {
      return;
    }
    const errand = await this.errands.findOne({ where: { id: event.errandId } });
    if (!errand) {
      return;
    }
    const profile = await this.customers.findOne({
      where: { id: errand.customerId },
    });
    if (!profile) {
      return;
    }
    const titleWithRef = `${copy.title} · ${humanStatus(event.status)}`;
    await this.notifications.save(
      this.notifications.create({
        userId: profile.userId,
        errandId: errand.id,
        eventType: `errand.${event.status}`,
        title: titleWithRef,
        body: copy.body,
      }),
    );
  }
}

const humanStatus = (s: ErrandStatus): string =>
  s
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

const feedCopy = (status: ErrandStatus): FeedCopy | null => {
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
      return { title: 'Task complete', body: 'Your task has been completed. Review the evidence and confirm.' };
    case ErrandStatus.CONFIRMED:
      return { title: 'Task confirmed', body: 'You confirmed the task. The runner will be paid out.' };
    case ErrandStatus.SETTLED:
      return { title: 'Task settled', body: 'The runner has been paid for your task.' };
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