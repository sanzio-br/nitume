import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { AuthContext, Roles } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { StatusHistoryActor, UserRole } from '../common/enums';
import { ErrandsService } from '../errands/errands.service';
import { AssignErrandDto, DeclineAssignmentDto, PurchaseCheckQueryDto, QuoteErrandDto } from './dto/matching.dto';
import { PurchaseCheck, PurchaseLimitService } from './purchase-limit.service';

@Controller('errands')
export class MatchingController {
  constructor(
    private readonly errands: ErrandsService,
    private readonly purchaseLimits: PurchaseLimitService,
  ) {}

  /**
   * Row 108: the task's required out-of-pocket purchase against a runner's
   * max_purchase_advance. Runner (current assignment): their own. Admin:
   * `runnerProfileId` (before assigning), else the current runner.
   */
  @Get(':id/purchase-check')
  @Roles(UserRole.RUNNER, UserRole.ADMIN)
  purchaseCheck(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthContext,
    @Query() query: PurchaseCheckQueryDto,
  ): Promise<PurchaseCheck> {
    return this.purchaseLimits.check(id, { role: user.role, userId: user.userId }, query.runnerProfileId);
  }

  /**
   * Row 108: the current runner declines while the task is RUNNER_ASSIGNED
   * because the required purchase is above their limit. The task keeps its
   * status (no new state) and waits for an admin to reassign it. Errors: 409
   * purchase_within_limit, assignment_not_declinable; 403 not the runner.
   */
  @Post(':id/assignment/decline')
  @HttpCode(200)
  @Roles(UserRole.RUNNER)
  decline(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthContext,
    @Body() dto: DeclineAssignmentDto,
  ) {
    return this.purchaseLimits.decline(id, user.userId, dto.reason);
  }

  /** Mobile-money payment must be in place before a runner is assigned: the
   * state machine only allows PAYMENT_CONFIRMED -> RUNNER_ASSIGNED. After a
   * decline (row 108) it reassigns a RUNNER_ASSIGNED task (`history: null`).
   * The new assignment is an offer open for 10 minutes
   * (`assignment.offerExpiresAt`, MATCHING_ADMIN_OFFER_WINDOW_SECONDS, rows
   * 114, 141). Unaccepted by then, the assignment becomes `expired`
   * (offer-expiry job, or this call if it comes first) and the task stays
   * RUNNER_ASSIGNED so it can be assigned again here (row 157). The
   * deadline only matters while the task is RUNNER_ASSIGNED and the
   * assignment `assigned`; once accepted it is kept for the record. */
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