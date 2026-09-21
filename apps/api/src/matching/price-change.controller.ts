import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { AuthContext, Roles } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UserRole } from '../common/enums';
import { PriceChangeRequest } from './price-change-request.entity';
import { PriceChangeService } from './price-change.service';
import {
  PriceChangeRequestParamsDto,
  RequestPriceChangeDto,
} from './dto/price-change.dto';

@Controller('errands/:errandId/price-change')
@UseGuards(JwtAuthGuard)
export class PriceChangeController {
  constructor(private readonly priceChange: PriceChangeService) {}

  @Post()
  @Roles(UserRole.RUNNER, UserRole.ADMIN)
  request(
    @Param('errandId') errandId: string,
    @Body() dto: RequestPriceChangeDto,
    @CurrentUser() user: AuthContext,
  ): Promise<PriceChangeRequest> {
    return this.priceChange.request(errandId, dto, {
      userId: user.userId,
      role: user.role,
    });
  }

  @Post(':requestId/approve')
  @Roles(UserRole.CUSTOMER, UserRole.ADMIN)
  approve(
    @Param() params: PriceChangeRequestParamsDto,
    @CurrentUser() user: AuthContext,
  ): Promise<PriceChangeRequest> {
    return this.priceChange.approve(params.errandId, params.requestId, {
      userId: user.userId,
      role: user.role,
    });
  }

  @Post(':requestId/reject')
  @Roles(UserRole.CUSTOMER, UserRole.ADMIN)
  reject(
    @Param() params: PriceChangeRequestParamsDto,
    @CurrentUser() user: AuthContext,
  ): Promise<PriceChangeRequest> {
    return this.priceChange.reject(params.errandId, params.requestId, {
      userId: user.userId,
      role: user.role,
    });
  }
}