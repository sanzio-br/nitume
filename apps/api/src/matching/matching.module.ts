import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ErrandsModule } from '../errands/errands.module';
import { PaymentsModule } from '../payments/payments.module';
import { Errand } from '../errands/errand.entity';
import { ErrandAssignment } from '../errands/errand-assignment.entity';
import { RunnerProfile } from '../runners/runner-profile.entity';
import { MatchingController } from './matching.controller';
import { PriceChangeController } from './price-change.controller';
import { PriceChangeRequest } from './price-change-request.entity';
import { PriceChangeService } from './price-change.service';
import { PurchaseLimitService } from './purchase-limit.service';
import { RunnerJobsController } from './runner-jobs.controller';
import { RunnerJobsService } from './runner-jobs.service';
import { RunnersModule } from '../runners/runners.module';

@Module({
  imports: [
    ErrandsModule,
    PaymentsModule,
    RunnersModule,
    TypeOrmModule.forFeature([
      PriceChangeRequest,
      Errand,
      ErrandAssignment,
      RunnerProfile,
    ]),
  ],
  controllers: [MatchingController, PriceChangeController, RunnerJobsController],
  providers: [PriceChangeService, PurchaseLimitService, RunnerJobsService],
  exports: [PriceChangeService],
})
export class MatchingModule {}