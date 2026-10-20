import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ErrandsModule } from '../errands/errands.module';
import { LocationModule } from '../location/location.module';
import { RunnersModule } from '../runners/runners.module';
import { UsersModule } from '../users/users.module';
import { LocationRelay } from './location-relay';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [JwtModule.register({}), UsersModule, ErrandsModule, RunnersModule, LocationModule],
  providers: [RealtimeGateway, LocationRelay],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
