import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ErrandsModule } from '../errands/errands.module';
import { DisputeEvent } from './dispute-event.entity';
import { Dispute } from './dispute.entity';
import { DisputesController } from './disputes.controller';
import { DisputesService } from './disputes.service';

@Module({
  imports: [ErrandsModule, TypeOrmModule.forFeature([Dispute, DisputeEvent])],
  controllers: [DisputesController],
  providers: [DisputesService],
  exports: [DisputesService],
})
export class DisputesModule {}
