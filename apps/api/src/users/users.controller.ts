import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { AuthContext, Roles } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/enums';
import { Device } from './device.entity';
import { DevicesService } from './devices.service';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { PublicUser, UsersService } from './users.service';

@Controller('users')
@Roles(UserRole.CUSTOMER, UserRole.RUNNER, UserRole.ADMIN, UserRole.BUSINESS)
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly devices: DevicesService,
  ) {}

  @Get('me')
  getMe(@CurrentUser() user: AuthContext): Promise<PublicUser> {
    return this.users.getPublicProfile(user.userId);
  }

  @Patch('me')
  updateMe(
    @CurrentUser() user: AuthContext,
    @Body() dto: UpdateProfileDto,
  ): Promise<PublicUser> {
    return this.users.updateProfile(user.userId, {
      email: dto.email,
      displayName: dto.displayName,
    });
  }

  /** Register or refresh this install's FCM push token (idempotent upsert). */
  @Post('me/devices')
  @HttpCode(200)
  registerDevice(
    @CurrentUser() user: AuthContext,
    @Body() dto: RegisterDeviceDto,
  ): Promise<Device> {
    return this.devices.register(user.userId, dto);
  }

  @Delete('me/devices/:id')
  @HttpCode(204)
  async removeDevice(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.devices.remove(user.userId, id);
  }
}
