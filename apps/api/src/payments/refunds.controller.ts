import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthContext, Roles } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UserRole } from '../common/enums';
import {
  CountRefundsQueryDto,
  CreateRefundPayoutCorrectionDto,
  DecideRefundDto,
  ListRefundsQueryDto,
  MarkRefundPaidDto,
} from './dto/refund.dto';
import { AdminRefundDetail, AdminRefundReview, RefundsService } from './refunds.service';

/** Admin refund reviews for tasks cancelled after payment. */
@Controller('refunds')
@UseGuards(JwtAuthGuard)
@Roles(UserRole.ADMIN)
export class RefundsController {
  constructor(private readonly refunds: RefundsService) {}

  @Get()
  list(@Query() query: ListRefundsQueryDto) {
    return this.refunds.list(query);
  }

  /** `{ count }`, optionally for one status (N-7, sidebar badge). */
  @Get('count')
  count(@Query() query: CountRefundsQueryDto): Promise<{ count: number }> {
    return this.refunds.count(query.status);
  }

  /** Review + errand summary, admin names, customer M-Pesa phone, paid breakdown (N-1, N-2). */
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<AdminRefundDetail> {
    return this.refunds.detail(id);
  }

  @Patch(':id/decision')
  @HttpCode(200)
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideRefundDto,
    @CurrentUser() user: AuthContext,
  ): Promise<AdminRefundReview> {
    return this.refunds.decide(id, dto.refundAmount, dto.note, user.userId);
  }

  @Post(':id/mark-paid')
  @HttpCode(200)
  markPaid(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkRefundPaidDto,
    @CurrentUser() user: AuthContext,
  ): Promise<AdminRefundReview> {
    return this.refunds.markPaid(id, dto.payoutReference, user.userId);
  }

  /**
   * Records a payout correction or reversal on a `refunded` review (row 100).
   * Returns the updated detail (with `corrections` and the effective payout).
   * 409 `refund_not_refunded`, 409 `refund_payout_already_reversed`.
   */
  @Post(':id/corrections')
  @HttpCode(201)
  addCorrection(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateRefundPayoutCorrectionDto,
    @CurrentUser() user: AuthContext,
  ): Promise<AdminRefundDetail> {
    return this.refunds.addCorrection(id, dto, user.userId);
  }
}
