import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { DisputesModule } from '../disputes/disputes.module';
import { ErrandsModule } from '../errands/errands.module';
import { MAINTENANCE_QUEUE, queueWorkersEnabled } from '../infra/queue/queues';
import { PaymentsModule } from '../payments/payments.module';
import { RunnersModule } from '../runners/runners.module';
import { IdDocumentRetentionService } from './id-document-retention.service';
import { LocationRetentionService } from './location-retention.service';
import { MaintenanceProcessor } from './maintenance.processor';
import { MaintenanceScheduler } from './maintenance.scheduler';

/** Dispute-window, STK reconcile and retention (ID images, job locations) jobs on the maintenance queue. */
@Module({
  imports: [
    ErrandsModule,
    PaymentsModule,
    RunnersModule,
    DisputesModule,
    BullModule.registerQueue({ name: MAINTENANCE_QUEUE }),
  ],
  providers: [
    IdDocumentRetentionService,
    LocationRetentionService,
    ...(queueWorkersEnabled() ? [MaintenanceProcessor, MaintenanceScheduler] : []),
  ],
  exports: [IdDocumentRetentionService, LocationRetentionService],
})
export class SchedulerModule {}
