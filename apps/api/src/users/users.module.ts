import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Device } from './device.entity';
import { DevicesService } from './devices.service';
import { User } from './user.entity';
import { UserStatusHistory } from './user-status-history.entity';
import { UserAccessService } from './user-access.service';
import { UserStatusStore } from './user-status.store';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Device, UserStatusHistory])],
  controllers: [UsersController],
  providers: [UsersService, DevicesService, UserAccessService, UserStatusStore],
  exports: [UsersService, DevicesService, UserAccessService, UserStatusStore],
})
export class UsersModule {}