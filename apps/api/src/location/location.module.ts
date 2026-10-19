import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ErrandsModule } from '../errands/errands.module';
import { LOCATION_QUEUE, queueWorkersEnabled } from '../infra/queue/queues';
import { RunnersModule } from '../runners/runners.module';
import { LocationController } from './location.controller';
import { LocationIngestService } from './location-ingest.service';
import { LocationProcessor } from './location.processor';
import { LocationService } from './location.service';

@Module({
  imports: [ErrandsModule, RunnersModule, BullModule.registerQueue({ name: LOCATION_QUEUE })],
  controllers: [LocationController],
  providers: [LocationService, LocationIngestService, ...(queueWorkersEnabled() ? [LocationProcessor] : [])],
  exports: [LocationService, LocationIngestService],
})
export class LocationModule {}
