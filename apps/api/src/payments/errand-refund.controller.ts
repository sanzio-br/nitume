import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { AuthContext, Roles } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UserRole } from '../common/enums';
import { CustomerRefundView, RefundsService } from './refunds.service';

/** Customer-readable refund status of a task (rows 55, 71). */
@Controller('errands/:errandId')
@UseGuards(JwtAuthGuard)
@Roles(UserRole.CUSTOMER, UserRole.ADMIN)
export class ErrandRefundController {
  constructor(private readonly refunds: RefundsService) {}

  /**
   * One review, unchanged shape: the cancellation review when there is one,
   * else the newest (e.g. a price-decrease review). 404 `refund_not_found`.
   */
  @Get('refund')
  get(
    @Param('errandId', ParseUUIDPipe) errandId: string,
    @CurrentUser() user: AuthContext,
  ): Promise<CustomerRefundView> {
    return this.refunds.forCustomer(errandId, { userId: user.userId, role: user.role });
  }

  /** Every refund review of the task, newest first (row 71). Never 404s on none. */
  @Get('refunds')
  list(
    @Param('errandId', ParseUUIDPipe) errandId: string,
    @CurrentUser() user: AuthContext,
  ): Promise<{ items: CustomerRefundView[] }> {
    return this.refunds.forCustomerAll(errandId, { userId: user.userId, role: user.role });
  }
}
