import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { AuthContext, Roles } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UserRole } from '../common/enums';
import {
  CountRunnerPayoutsQueryDto,
  CreateRunnerPayoutCorrectionDto,
  HoldRunnerPayoutDto,
  ListRunnerPayoutsQueryDto,
  MarkRunnerPayoutsPaidDto,
  ReviewRunnerPayoutDto,
  RunnerSummaryQueryDto,
} from './dto/runner-payout.dto';
import {
  AdminRunnerPayoutDetail,
  AdminRunnerPayoutItem,
  EarningsSummary,
  RunnerPayoutsService,
} from './runner-payouts.service';

/**
 * Admin runner payout ledger (owner answers rows 104-108): obligations
 * (`runner_fee`, `item_reimbursement`), ops review, manual M-Pesa payouts and
 * their corrections. Static routes are declared before `:id`.
 */
@Controller('runner-payouts')
@UseGuards(JwtAuthGuard)
@Roles(UserRole.ADMIN)
export class RunnerPayoutsController {
  constructor(private readonly payouts: RunnerPayoutsService) {}

  /** `status` is the effective status: `payable` includes paid lines whose payout was reversed. */
  @Get()
  list(@Query() query: ListRunnerPayoutsQueryDto) {
    return this.payouts.list(query);
  }

  /** `{ count }`, optionally in one effective status (e.g. `pending_review` badge). */
  @Get('count')
  count(@Query() query: CountRunnerPayoutsQueryDto): Promise<{ count: number }> {
    return this.payouts.count(query.status);
  }

  /** A runner's earnings summary, as the runner app shows it. */
  @Get('summary')
  summary(@Query() query: RunnerSummaryQueryDto): Promise<EarningsSummary> {
    return this.payouts.summaryFor(query.runnerProfileId, query);
  }

  /**
   * Records one manual M-Pesa payout for 1-50 payable lines of one runner.
   * Errors: 404; 409 runner_payout_locked, runner_payout_not_payable,
   * payout_reference_reused; 400 runner_payout_mixed_runners.
   */
  @Post('mark-paid')
  @HttpCode(200)
  markPaid(
    @Body() dto: MarkRunnerPayoutsPaidDto,
    @CurrentUser() user: AuthContext,
  ): Promise<{ items: AdminRunnerPayoutItem[] }> {
    return this.payouts.markPaid(dto.lineIds, dto.payoutReference, user.userId);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<AdminRunnerPayoutDetail> {
    return this.payouts.detail(id);
  }

  /**
   * Approve (with `amount`) or reject (with `note`) an item reimbursement in
   * review. Errors: 409 runner_payout_not_in_review; 400
   * reimbursement_exceeds_cap (`cap`, `requestedAmount`, `itemPaidToNitume`),
   * decision_note_required.
   */
  @Post(':id/review')
  @HttpCode(200)
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewRunnerPayoutDto,
    @CurrentUser() user: AuthContext,
  ): Promise<AdminRunnerPayoutDetail> {
    return this.payouts.review(id, dto, user.userId);
  }

  /** Receipt mismatch: an unpaid payable item line goes back to review. 409 runner_payout_not_holdable. */
  @Post(':id/hold')
  @HttpCode(200)
  hold(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: HoldRunnerPayoutDto,
    @CurrentUser() user: AuthContext,
  ): Promise<AdminRunnerPayoutDetail> {
    return this.payouts.hold(id, dto.note, user.userId);
  }

  /**
   * Correction / reversal / re-sent payout on a paid line (append-only).
   * Errors: 409 runner_payout_not_paid, payout_correction_conflict,
   * payout_correction_kind_invalid, payout_reference_reused; 400
   * correction_no_change, runner_payout_exceeds_amount (`correctionCeiling`),
   * payout_reference_required, payout_amount_required,
   * payout_amount_not_allowed, correction_reason_invalid.
   */
  @Post(':id/corrections')
  @HttpCode(201)
  addCorrection(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateRunnerPayoutCorrectionDto,
    @CurrentUser() user: AuthContext,
  ): Promise<AdminRunnerPayoutDetail> {
    return this.payouts.addCorrection(id, dto, user.userId);
  }
}
