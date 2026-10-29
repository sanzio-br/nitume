import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { MAINTENANCE_QUEUE } from '../infra/queue/queues';
import {
  DISPUTE_WINDOW_JOB,
  ID_DOCUMENT_PURGE_JOB,
  LOCATION_PURGE_JOB,
  OFFER_EXPIRY_JOB,
  STK_RECONCILE_JOB,
  WEB_PRESENCE_SWEEP_JOB,
} from './maintenance.processor';

/**
 * Registers the repeatable maintenance jobs. upsertJobScheduler is
 * idempotent, so several instances starting at once keep one schedule each.
 */
@Injectable()
export class MaintenanceScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(MaintenanceScheduler.name);

  constructor(
    @InjectQueue(MAINTENANCE_QUEUE) private readonly queue: Queue,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const disputeEvery = this.config.get<number>('queue.disputeSweepIntervalSeconds', 300) * 1000;
    const stkEvery = this.config.get<number>('queue.stkReconcileIntervalSeconds', 60) * 1000;
    const offerEvery = this.config.get<number>('queue.offerExpirySweepIntervalSeconds', 30) * 1000;
    const webPresenceEvery = this.config.get<number>('queue.webPingSweepIntervalSeconds', 30) * 1000;
    try {
      await this.queue.upsertJobScheduler(DISPUTE_WINDOW_JOB, { every: disputeEvery }, {
        name: DISPUTE_WINDOW_JOB,
      });
      await this.queue.upsertJobScheduler(STK_RECONCILE_JOB, { every: stkEvery }, {
        name: STK_RECONCILE_JOB,
      });
      await this.queue.upsertJobScheduler(OFFER_EXPIRY_JOB, { every: offerEvery }, {
        name: OFFER_EXPIRY_JOB,
      });
      // Issue #36: one attempt per run (the next run is the retry).
      await this.queue.upsertJobScheduler(WEB_PRESENCE_SWEEP_JOB, { every: webPresenceEvery }, {
        name: WEB_PRESENCE_SWEEP_JOB,
        opts: { attempts: 1, removeOnComplete: true, removeOnFail: 100 },
      });
      // Row 154: once a day (default 03:00 EAT), never on start-up.
      await this.queue.upsertJobScheduler(
        ID_DOCUMENT_PURGE_JOB,
        { pattern: this.config.get<string>('runnerVerification.purgeCron', '0 3 * * *'), tz: 'Africa/Nairobi' },
        { name: ID_DOCUMENT_PURGE_JOB },
      );
      // Row 247: once a day (default 03:30 EAT), never on start-up.
      await this.queue.upsertJobScheduler(
        LOCATION_PURGE_JOB,
        { pattern: this.config.get<string>('location.retentionCron', '30 3 * * *'), tz: 'Africa/Nairobi' },
        { name: LOCATION_PURGE_JOB },
      );
    } catch (err) {
      this.logger.error(
        `Could not schedule maintenance jobs: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
