import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Device } from './device.entity';
import { DevicesService } from './devices.service';
import { User } from './user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Device])],
  controllers: [UsersController],
  providers: [UsersService, DevicesService],
  exports: [UsersService, DevicesService],
})
export class UsersModule {}