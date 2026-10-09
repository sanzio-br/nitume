import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ErrandsModule } from '../errands/errands.module';
import { MAINTENANCE_QUEUE, queueWorkersEnabled } from '../infra/queue/queues';
import { PaymentsModule } from '../payments/payments.module';
import { MaintenanceProcessor } from './maintenance.processor';
import { MaintenanceScheduler } from './maintenance.scheduler';

/** Dispute-window and STK reconcile jobs on the maintenance queue. */
@Module({
  imports: [ErrandsModule, PaymentsModule, BullModule.registerQueue({ name: MAINTENANCE_QUEUE })],
  providers: queueWorkersEnabled() ? [MaintenanceProcessor, MaintenanceScheduler] : [],
})
export class SchedulerModule {}
