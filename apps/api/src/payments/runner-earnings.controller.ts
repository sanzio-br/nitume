import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthContext, Roles } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UserRole } from '../common/enums';
import { CreateReimbursementClaimDto, EarningsQueryDto, ListMyPayoutsQueryDto } from './dto/runner-payout.dto';
import { EarningsSummary, RunnerPayoutLineView, RunnerPayoutsService } from './runner-payouts.service';

/**
 * Runner-facing payout ledger reads and item reimbursement claims (rows
 * 104-107). Lives in the payments module (it owns the ledger) under the
 * `runners/me` path the Runner app uses.
 */
@Controller('runners/me')
@UseGuards(JwtAuthGuard)
@Roles(UserRole.RUNNER)
export class RunnerEarningsController {
  constructor(private readonly ledger: RunnerPayoutsService) {}

  /** Balance (pending review / payable / paid) by type, plus a period breakdown in EAT. 400 earnings_range_invalid. */
  @Get('earnings')
  earnings(@CurrentUser() user: AuthContext, @Query() query: EarningsQueryDto): Promise<EarningsSummary> {
    return this.ledger.earningsFor(user.userId, query);
  }

  /** The runner's ledger lines, newest first (cursor pagination). */
  @Get('payouts')
  listPayouts(
    @CurrentUser() user: AuthContext,
    @Query() query: ListMyPayoutsQueryDto,
  ): Promise<{ items: RunnerPayoutLineView[]; nextCursor: string | null }> {
    return this.ledger.payoutsFor(user.userId, query);
  }

  /**
   * Row 106: claim verified out-of-pocket item spend on a task that ended
   * CANCELLED or FAILED. Always goes to ops review. Errors: 409
   * reimbursement_claim_not_allowed, no_item_amount_paid,
   * reimbursement_already_recorded; 400 receipt_required,
   * reimbursement_exceeds_cap (`cap`); 403 not the task's runner.
   */
  @Post('reimbursement-claims')
  claim(
    @CurrentUser() user: AuthContext,
    @Body() dto: CreateReimbursementClaimDto,
  ): Promise<RunnerPayoutLineView> {
    return this.ledger.claim(user.userId, dto);
  }
}
