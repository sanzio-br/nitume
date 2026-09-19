import { Module } from '@nestjs/common';
import { ErrandsModule } from '../errands/errands.module';
import { MatchingController } from './matching.controller';

@Module({
  imports: [ErrandsModule],
  controllers: [MatchingController],
})
export class MatchingModule {}