import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AuthContext, Public, Roles } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UserRole } from '../common/enums';
import {
  AddVerificationDto,
  SetAvailabilityDto,
  SetServiceAreasDto,
  SetSkillsDto,
} from './dto/runner-actions.dto';
import {
  PublicRunnerProfile,
  RunnersService,
} from './runners.service';

@Controller('runners')
export class RunnersController {
  constructor(private readonly runners: RunnersService) {}

  @Public()
  @Get(':id/profile')
  getPublicProfile(@Param('id') id: string): Promise<PublicRunnerProfile> {
    return this.runners.publicProfile(id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @Roles(UserRole.RUNNER, UserRole.CUSTOMER, UserRole.ADMIN)
  getMine(@CurrentUser() user: AuthContext) {
    return this.runners.profileByUserId(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/availability')
  @Roles(UserRole.RUNNER)
  setAvailability(
    @CurrentUser() user: AuthContext,
    @Body() dto: SetAvailabilityDto,
  ) {
    return this.runners.setAvailability(user.userId, dto.availability);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/verifications')
  @Roles(UserRole.RUNNER)
  addVerification(
    @CurrentUser() user: AuthContext,
    @Body() dto: AddVerificationDto,
  ) {
    return this.runners.addVerification(
      user.userId,
      dto.verificationType,
      dto.documentS3Key ?? null,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/verifications')
  @Roles(UserRole.RUNNER)
  listVerifications(@CurrentUser() user: AuthContext) {
    return this.runners.verificationsByUserId(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Put('me/skills')
  @Roles(UserRole.RUNNER)
  setSkills(@CurrentUser() user: AuthContext, @Body() dto: SetSkillsDto) {
    return this.runners.setSkills(user.userId, dto.skills);
  }

  @UseGuards(JwtAuthGuard)
  @Put('me/service-areas')
  @Roles(UserRole.RUNNER)
  setServiceAreas(@CurrentUser() user: AuthContext, @Body() dto: SetServiceAreasDto) {
    return this.runners.setServiceAreas(user.userId, dto.areas);
  }
}