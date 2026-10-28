import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Device } from './device.entity';
import { DevicesService } from './devices.service';
import { User } from './user.entity';
import { UserStatusHistory } from './user-status-history.entity';
import { UserAccessService } from './user-access.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Device, UserStatusHistory])],
  controllers: [UsersController],
  providers: [UsersService, DevicesService, UserAccessService],
  exports: [UsersService, DevicesService, UserAccessService],
})
export class UsersModule {}