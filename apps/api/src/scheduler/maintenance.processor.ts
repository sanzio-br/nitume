import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { ErrandsService } from '../errands/errands.service';
import { MAINTENANCE_QUEUE } from '../infra/queue/queues';
import { PaymentsService } from '../payments/payments.service';

export const DISPUTE_WINDOW_JOB = 'dispute-window';
export const STK_RECONCILE_JOB = 'stk-reconcile';

/**
 * Scheduled system jobs (rows 26, 50, 52). Every write goes through the
 * owning module's service, so PostgreSQL stays the source of truth.
 */
@Processor(MAINTENANCE_QUEUE)
export class MaintenanceProcessor extends WorkerHost {
  private readonly logger = new Logger(MaintenanceProcessor.name);

  constructor(
    private readonly errands: ErrandsService,
    private readonly payments: PaymentsService,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case DISPUTE_WINDOW_JOB:
        return this.disputeWindow();
      case STK_RECONCILE_JOB:
        return { resolved: await this.payments.resolveTimedOut() };
      default:
        this.logger.warn(`Unknown maintenance job ${job.name}`);
        return null;
    }
  }

  /** COMPLETED past the dispute window -> CONFIRMED, then CONFIRMED -> SETTLED. */
  async disputeWindow(): Promise<{ confirmed: string[]; settled: string[] }> {
    const confirmed = await this.errands.confirmPastDisputeWindow();
    const settled = await this.payments.settleConfirmed();
    if (confirmed.length > 0 || settled.length > 0) {
      this.logger.log(`Dispute window: confirmed ${confirmed.length}, settled ${settled.length}`);
    }
    return { confirmed, settled };
  }
}
