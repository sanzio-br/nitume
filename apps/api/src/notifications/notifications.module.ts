import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Errand } from '../errands/errand.entity';
import { CustomerProfile } from '../customers/customer-profile.entity';
import { NOTIFICATIONS_QUEUE, queueWorkersEnabled } from '../infra/queue/queues';
import { ErrandsModule } from '../errands/errands.module';
import { PaymentsModule } from '../payments/payments.module';
import { RunnersModule } from '../runners/runners.module';
import { UsersModule } from '../users/users.module';
import { AppNotification } from './app-notification.entity';
import { NotificationLog } from './notification-log.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsService } from './notifications.service';
import { pushSenderProvider } from './push/push-sender.provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([AppNotification, NotificationLog, Errand, CustomerProfile]),
    BullModule.registerQueue({ name: NOTIFICATIONS_QUEUE }),
    UsersModule,
    // RA-6: the runner on the job and the payment route, through their services.
    ErrandsModule,
    RunnersModule,
    PaymentsModule,
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    pushSenderProvider,
    ...(queueWorkersEnabled() ? [NotificationsProcessor] : []),
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
