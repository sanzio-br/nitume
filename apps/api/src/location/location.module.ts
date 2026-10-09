import { Module } from '@nestjs/common';
import { ErrandsModule } from '../errands/errands.module';
import { RunnersModule } from '../runners/runners.module';
import { LocationController } from './location.controller';
import { LocationService } from './location.service';

@Module({
  imports: [ErrandsModule, RunnersModule],
  controllers: [LocationController],
  providers: [LocationService],
  exports: [LocationService],
})
export class LocationModule {}
