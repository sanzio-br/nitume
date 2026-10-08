import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { MAINTENANCE_QUEUE } from '../infra/queue/queues';
import { DISPUTE_WINDOW_JOB, STK_RECONCILE_JOB } from './maintenance.processor';

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
    try {
      await this.queue.upsertJobScheduler(DISPUTE_WINDOW_JOB, { every: disputeEvery }, {
        name: DISPUTE_WINDOW_JOB,
      });
      await this.queue.upsertJobScheduler(STK_RECONCILE_JOB, { every: stkEvery }, {
        name: STK_RECONCILE_JOB,
      });
    } catch (err) {
      this.logger.error(
        `Could not schedule maintenance jobs: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
