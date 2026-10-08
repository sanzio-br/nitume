import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { AuthContext, Roles } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UserRole } from '../common/enums';
import { CustomerRefundView, RefundsService } from './refunds.service';

/** Customer-readable refund status of a task (row 55). */
@Controller('errands/:errandId/refund')
@UseGuards(JwtAuthGuard)
@Roles(UserRole.CUSTOMER, UserRole.ADMIN)
export class ErrandRefundController {
  constructor(private readonly refunds: RefundsService) {}

  @Get()
  get(
    @Param('errandId', ParseUUIDPipe) errandId: string,
    @CurrentUser() user: AuthContext,
  ): Promise<CustomerRefundView> {
    return this.refunds.forCustomer(errandId, { userId: user.userId, role: user.role });
  }
}
