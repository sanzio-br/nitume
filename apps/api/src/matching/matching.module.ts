import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ErrandsModule } from '../errands/errands.module';
import { Errand } from '../errands/errand.entity';
import { ErrandAssignment } from '../errands/errand-assignment.entity';
import { RunnerProfile } from '../runners/runner-profile.entity';
import { MatchingController } from './matching.controller';
import { PriceChangeController } from './price-change.controller';
import { PriceChangeRequest } from './price-change-request.entity';
import { PriceChangeService } from './price-change.service';

@Module({
  imports: [
    ErrandsModule,
    TypeOrmModule.forFeature([
      PriceChangeRequest,
      Errand,
      ErrandAssignment,
      RunnerProfile,
    ]),
  ],
  controllers: [MatchingController, PriceChangeController],
  providers: [PriceChangeService],
  exports: [PriceChangeService],
})
export class MatchingModule {}