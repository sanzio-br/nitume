import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthContext, Roles } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UserRole } from '../common/enums';
import { CreateReimbursementClaimDto, EarningsQueryDto, ListPayoutLinesQueryDto } from './dto/runner-payout.dto';
import { EarningsSummary, PayoutFeedItem, RunnerPayoutsService } from './runner-payouts.service';

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

  /**
   * The runner's payout feed (RA-14, RA-16): runner_fee and
   * item_reimbursement lines, derived `payout` entries (one per M-Pesa
   * payout), and correction / reversal / resent_payout entries; signed
   * amounts, newest first, cursor pagination.
   */
  @Get('payout-lines')
  payoutLines(
    @CurrentUser() user: AuthContext,
    @Query() query: ListPayoutLinesQueryDto,
  ): Promise<{ items: PayoutFeedItem[]; nextCursor: string | null }> {
    return this.ledger.payoutLinesFor(user.userId, {
      kinds: query.kind,
      errandId: query.errandId,
      cursor: query.cursor,
      limit: query.limit,
    });
  }

  /**
   * Row 106: claim verified out-of-pocket item spend on a task that ended
   * CANCELLED or FAILED. Always goes to ops review. Errors: 409
   * reimbursement_claim_not_allowed, no_item_amount_paid,
   * reimbursement_already_recorded; 400 receipt_required,
   * reimbursement_exceeds_cap (`cap`, `itemPaidToNitume`, `maxPurchaseAdvance`); 403 not the task's runner.
   */
  @Post('reimbursement-claims')
  claim(
    @CurrentUser() user: AuthContext,
    @Body() dto: CreateReimbursementClaimDto,
  ): Promise<PayoutFeedItem> {
    return this.ledger.claim(user.userId, dto);
  }
}
