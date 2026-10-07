import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { AuthContext, Roles } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/enums';
import { LocationService, TrackingSnapshot } from './location.service';

@Controller('errands')
export class LocationController {
  constructor(private readonly location: LocationService) {}

  /** Initial tracking snapshot (§3.2); live updates follow over Socket.IO. */
  @Get(':id/tracking')
  @Roles(UserRole.CUSTOMER, UserRole.RUNNER, UserRole.ADMIN)
  tracking(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthContext,
  ): Promise<TrackingSnapshot> {
    return this.location.trackingFor(id, { role: user.role, userId: user.userId });
  }
}
