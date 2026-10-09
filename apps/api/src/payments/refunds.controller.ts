import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthContext, Roles } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UserRole } from '../common/enums';
import { DecideRefundDto, ListRefundsQueryDto, MarkRefundPaidDto } from './dto/refund.dto';
import { RefundReview } from './refund-review.entity';
import { RefundsService } from './refunds.service';

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

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<RefundReview> {
    return this.refunds.get(id);
  }

  @Patch(':id/decision')
  @HttpCode(200)
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideRefundDto,
    @CurrentUser() user: AuthContext,
  ): Promise<RefundReview> {
    return this.refunds.decide(id, dto.refundAmount, dto.note, user.userId);
  }

  @Post(':id/mark-paid')
  @HttpCode(200)
  markPaid(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkRefundPaidDto,
    @CurrentUser() user: AuthContext,
  ): Promise<RefundReview> {
    return this.refunds.markPaid(id, dto.payoutReference, user.userId);
  }
}
