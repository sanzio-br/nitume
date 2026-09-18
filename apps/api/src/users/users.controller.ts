import { Body, Controller, Get, Patch } from '@nestjs/common';
import { AuthContext, Roles } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/enums';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { PublicUser, UsersService } from './users.service';

@Controller('users')
@Roles(UserRole.CUSTOMER, UserRole.RUNNER, UserRole.ADMIN, UserRole.BUSINESS)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user: AuthContext): Promise<PublicUser> {
    return this.users.getPublicProfile(user.userId);
  }

  @Patch('me')
  updateMe(
    @CurrentUser() user: AuthContext,
    @Body() dto: UpdateProfileDto,
  ): Promise<PublicUser> {
    return this.users.updateProfile(user.userId, { email: dto.email });
  }
}