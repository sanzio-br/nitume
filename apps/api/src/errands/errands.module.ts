import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerProfile } from '../customers/customer-profile.entity';
import { RunnerProfile } from '../runners/runner-profile.entity';
import { RunnersModule } from '../runners/runners.module';
import { ErrandAssignment } from './errand-assignment.entity';
import { ErrandItem } from './errand-item.entity';
import { ErrandLocation } from './errand-location.entity';
import { ErrandStatusHistory } from './errand-status-history.entity';
import { Errand } from './errand.entity';
import { ErrandsController } from './errands.controller';
import { ErrandsService } from './errands.service';

@Module({
  imports: [
    RunnersModule,
    TypeOrmModule.forFeature([
      Errand,
      ErrandLocation,
      ErrandItem,
      ErrandStatusHistory,
      ErrandAssignment,
      CustomerProfile,
      RunnerProfile,
    ]),
  ],
  controllers: [ErrandsController],
  providers: [ErrandsService],
  exports: [ErrandsService],
})
export class ErrandsModule {}