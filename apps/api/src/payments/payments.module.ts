import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerProfile } from '../customers/customer-profile.entity';
import { CustomersModule } from '../customers/customers.module';
import { ErrandsModule } from '../errands/errands.module';
import { UsersModule } from '../users/users.module';
import { EvidenceModule } from '../evidence/evidence.module';
import { RunnersModule } from '../runners/runners.module';
import { Payment } from './payment.entity';
import { PaymentTransaction } from './payment-transaction.entity';
import { PaymentType } from './payment-type.entity';
import { ErrandRefundController } from './errand-refund.controller';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { RefundPayoutCorrection } from './refund-payout-correction.entity';
import { RefundReview } from './refund-review.entity';
import { RefundsController } from './refunds.controller';
import { RefundsService } from './refunds.service';
import { RunnerPayoutLine } from './runner-payout-line.entity';
import { RunnerPayoutRequest } from './runner-payout-request.entity';
import { RunnerPayoutRequestsController } from './runner-payout-requests.controller';
import { RunnerPayoutRequestsService } from './runner-payout-requests.service';
import { TaskExposureOverride } from './task-exposure-override.entity';
import { RunnerPayoutsService } from './runner-payouts.service';
import { RunnerPayoutsController } from './runner-payouts.controller';
import { RunnerEarningsController } from './runner-earnings.controller';
import { MerchantDetailsWatcher } from './merchant-details.watcher';
import { BullModule } from '@nestjs/bullmq';
import { MAINTENANCE_QUEUE } from '../infra/queue/queues';
import { ConsoleMpesaProvider } from './providers/console.provider';
import { mpesaProviderFactory } from './providers/mpesa-provider.factory';

@Module({
  imports: [
    ErrandsModule,
    CustomersModule,
    UsersModule,
    EvidenceModule,
    RunnersModule,
    BullModule.registerQueue({ name: MAINTENANCE_QUEUE }),
    TypeOrmModule.forFeature([
      Payment,
      PaymentTransaction,
      PaymentType,
      CustomerProfile,
      RefundReview,
      RefundPayoutCorrection,
      RunnerPayoutLine,
      RunnerPayoutRequest,
      TaskExposureOverride,
    ]),
  ],
  controllers: [
    PaymentsController,
    RefundsController,
    ErrandRefundController,
    RunnerPayoutsController,
    RunnerPayoutRequestsController,
    RunnerEarningsController,
  ],
  providers: [
    PaymentsService,
    RefundsService,
    RunnerPayoutsService,
    RunnerPayoutRequestsService,
    MerchantDetailsWatcher,
    ConsoleMpesaProvider,
    mpesaProviderFactory,
  ],
  exports: [PaymentsService, RefundsService, RunnerPayoutsService],
})
export class PaymentsModule {}