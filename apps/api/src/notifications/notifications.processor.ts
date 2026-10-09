import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { NOTIFICATIONS_QUEUE } from '../infra/queue/queues';
import { FEED_JOB, FeedJob, NotificationsService, PUSH_JOB } from './notifications.service';

/** Worker for the `notifications` queue (§4.4). */
@Processor(NOTIFICATIONS_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(private readonly notifications: NotificationsService) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case FEED_JOB:
        return this.notifications.deliverFeed(job.data as FeedJob);
      case PUSH_JOB:
        return this.notifications.deliverPush((job.data as { notificationId: string }).notificationId);
      default:
        this.logger.warn(`Unknown notifications job ${job.name}`);
        return null;
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job | undefined, err: Error): Promise<void> {
    if (!job || job.name !== PUSH_JOB || job.attemptsMade < (job.opts.attempts ?? 1)) {
      return;
    }
    await this.notifications.recordDeadLetter(
      (job.data as { notificationId: string }).notificationId,
      err.message,
    );
  }
}
