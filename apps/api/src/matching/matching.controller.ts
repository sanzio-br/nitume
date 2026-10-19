import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { AuthContext, Roles } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { StatusHistoryActor, UserRole } from '../common/enums';
import { ErrandsService } from '../errands/errands.service';
import { AssignErrandDto, DeclineAssignmentDto, ListCandidatesQueryDto, PurchaseCheckQueryDto, QuoteErrandDto } from './dto/matching.dto';
import { CandidatesPage, CandidatesService } from './candidates.service';
import { PurchaseCheck, PurchaseLimitService } from './purchase-limit.service';

@Controller('errands')
export class MatchingController {
  constructor(
    private readonly errands: ErrandsService,
    private readonly purchaseLimits: PurchaseLimitService,
    private readonly candidatesService: CandidatesService,
  ) {}

  /**
   * N-20 (rows 177, 178, 186, 187 (c), 204, 215): the runners an admin may
   * offer the task to. `{ items: CandidateView[], nextCursor,
   * eligibleRemaining, offlineCount, triedCount, requiredPurchase }`.
   * Pool: active, verified, the task's category in skills, inside one of
   * their service areas when areas are configured; busy runners and the
   * runner holding the current offer are left out. Items carry `offline`,
   * `tried` (declined | expired) and `ineligibleReason`
   * (over_purchase_limit). `eligibleRemaining` counts online, untried,
   * within-limit runners only. Sorted: online, untried, within the limit
   * first, then nearest. `?limit` 1-100 (default 50), `?cursor` opaque.
   * Read only: never expires the task. 404; 409 task_not_assignable
   * (`status`) unless PAYMENT_CONFIRMED or RUNNER_ASSIGNED; 400 cursor_invalid.
   */
  @Get(':id/candidates')
  @Roles(UserRole.ADMIN)
  candidates(@Param('id', ParseUUIDPipe) id: string, @Query() query: ListCandidatesQueryDto): Promise<CandidatesPage> {
    return this.candidatesService.list(id, { limit: query.limit, cursor: query.cursor ?? null });
  }

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
   * Row 108, kept for existing clients: same as `POST /errands/:id/decline`
   * with `reason: over_purchase_limit` (required here). Prefer the general
   * decline (row 137). Errors: 409 purchase_within_limit,
   * assignment_not_declinable, offer_expired; 403 not the runner.
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
   * RUNNER_ASSIGNED so it can be assigned again here (row 157), to another
   * runner: 409 `runner_already_offered` for one who declined or let an
   * offer for this task lapse (row 178). The
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