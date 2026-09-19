import { Body, Controller, Param, Post } from '@nestjs/common';
import { AuthContext, Roles } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { StatusHistoryActor, UserRole } from '../common/enums';
import { ErrandsService } from '../errands/errands.service';
import { AssignErrandDto, QuoteErrandDto } from './dto/matching.dto';

@Controller('errands')
export class MatchingController {
  constructor(private readonly errands: ErrandsService) {}

  /** Mobile-money payment must be in place before a runner is assigned: the
   * state machine only allows PAYMENT_CONFIRMED -> RUNNER_ASSIGNED. */
  @Post(':id/assign')
  @Roles(UserRole.ADMIN)
  assign(
    @Param('id') id: string,
    @CurrentUser() user: AuthContext,
    @Body() dto: AssignErrandDto,
  ) {
    return this.errands.assign(
      id,
      dto.runnerProfileId,
      { type: StatusHistoryActor.ADMIN, id: user.userId },
      dto.note,
    );
  }

  @Post(':id/quote')
  @Roles(UserRole.ADMIN)
  quote(
    @Param('id') id: string,
    @CurrentUser() user: AuthContext,
    @Body() dto: QuoteErrandDto,
  ) {
    return this.errands.quote(id, {
      total: dto.total,
      baseFee: dto.baseFee,
      distanceFee: dto.distanceFee,
      timeFee: dto.timeFee,
      urgencyFee: dto.urgencyFee,
      complexityFee: dto.complexityFee,
      premiumFee: dto.premiumFee,
      currency: dto.currency,
      expiresAt: dto.expiresAt,
    }, { type: StatusHistoryActor.ADMIN, id: user.userId }, dto.note);
  }
}