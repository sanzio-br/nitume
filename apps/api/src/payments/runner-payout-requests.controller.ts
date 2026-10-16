import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { AuthContext, Roles } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UserRole } from '../common/enums';
import {
  CountPayoutRequestsQueryDto,
  ListPayoutRequestsQueryDto,
  PayPayoutRequestDto,
  RejectPayoutRequestDto,
} from './dto/runner-payout.dto';
import { RunnerPayoutRequestStatus } from './runner-payout-request.entity';
import { AdminRunnerPayoutRequestView, RunnerPayoutRequestsService } from './runner-payout-requests.service';

/**
 * Admin runner payout requests (rows 117, 146, 153; N-17): list, count,
 * detail, pay with whole payable lines, reject. Static routes before `:id`.
 */
@Controller('runner-payout-requests')
@UseGuards(JwtAuthGuard)
@Roles(UserRole.ADMIN)
export class RunnerPayoutRequestsController {
  constructor(private readonly requests: RunnerPayoutRequestsService) {}

  /** Newest first; `status` requested | paid | rejected; cursor pagination. */
  @Get()
  list(@Query() query: ListPayoutRequestsQueryDto) {
    return this.requests.list({
      status: query.status as RunnerPayoutRequestStatus | undefined,
      runnerProfileId: query.runnerProfileId,
      cursor: query.cursor,
      limit: query.limit,
    });
  }

  /** `{ count }` (badge: `status=requested`). */
  @Get('count')
  count(@Query() query: CountPayoutRequestsQueryDto): Promise<{ count: number }> {
    return this.requests.count(query.status as RunnerPayoutRequestStatus | undefined);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<AdminRunnerPayoutRequestView> {
    return this.requests.detail(id);
  }

  /**
   * Pays the request with whole payable lines of its runner (total at most
   * the request; below it, the request still closes `paid`, row 146).
   * Errors: 409 payout_request_not_open; 400 payout_exceeds_request,
   * payout_request_runner_mismatch; mark-paid errors (409
   * runner_payout_locked, runner_payout_not_payable, payout_reference_reused).
   */
  @Post(':id/pay')
  @HttpCode(200)
  pay(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PayPayoutRequestDto,
    @CurrentUser() user: AuthContext,
  ): Promise<AdminRunnerPayoutRequestView> {
    return this.requests.pay(id, dto.lineIds, dto.payoutReference, user.userId);
  }

  /** Rejects with a reason shown to the runner (5-300). 409 payout_request_not_open; 400 decision_note_required. */
  @Post(':id/reject')
  @HttpCode(200)
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectPayoutRequestDto,
    @CurrentUser() user: AuthContext,
  ): Promise<AdminRunnerPayoutRequestView> {
    return this.requests.reject(id, dto.note, user.userId);
  }
}
