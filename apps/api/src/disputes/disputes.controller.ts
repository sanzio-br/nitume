import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AuthContext, Roles } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/enums';
import { DisputeIdParamsDto, OpenDisputeDto } from './dto/dispute.dto';
import { DisputeView, DisputesService } from './disputes.service';

@Controller('disputes')
export class DisputesController {
  constructor(private readonly disputes: DisputesService) {}

  /** Report a problem on an errand (§3.2 `POST /disputes`). */
  @Post()
  @Roles(UserRole.CUSTOMER)
  open(
    @Body() dto: OpenDisputeDto,
    @CurrentUser() user: AuthContext,
  ): Promise<DisputeView> {
    return this.disputes.open(dto, { userId: user.userId, role: user.role });
  }

  @Get(':id')
  @Roles(UserRole.CUSTOMER, UserRole.RUNNER, UserRole.ADMIN)
  get(
    @Param() params: DisputeIdParamsDto,
    @CurrentUser() user: AuthContext,
  ): Promise<DisputeView> {
    return this.disputes.get(params.id, { userId: user.userId, role: user.role });
  }
}
