import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ErrandsModule } from '../errands/errands.module';
import { UsersModule } from '../users/users.module';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [JwtModule.register({}), UsersModule, ErrandsModule],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
