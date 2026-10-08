import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthContext, Public, Roles } from '../common/decorators/auth.decorators';
import { UserRole } from '../common/enums';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { InitiatePaymentDto } from './dto/payment.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @UseGuards(JwtAuthGuard)
  /**
   * Starts the STK push for service + runner fee. Send an `Idempotency-Key`
   * header (8-128 chars) and reuse it on retries: the stored payment comes
   * back instead of a second charge.
   */
  @Post(':errandId/initiate')
  initiate(
    @Param('errandId') errandId: string,
    @CurrentUser() user: AuthContext,
    @Body() dto: InitiatePaymentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.payments.initiate(errandId, user, {
      idempotencyKey,
      merchantRoute: dto.merchantRoute,
      paymentMethodId: dto.paymentMethodId,
    });
  }

  /**
   * Provider callback. The body shape depends on PAYMENTS_PROVIDER (console
   * mock: MpesaCallbackDto; PayHero: its callback JSON), so it is parsed by
   * the provider, not by the global ValidationPipe. A real provider's
   * callback is confirmed by a status query before anything is marked paid.
   */
  @Public()
  @Post('mpesa/callback')
  async mpesaCallback(@Body() body: Record<string, unknown>): Promise<{ received: true }> {
    await this.payments.handleCallback(body);
    return { received: true };
  }

  /**
   * Retries the STK charge of a send_to_runner price-change difference after
   * it FAILED (rows 44, 48). A pending or paid difference comes back as is.
   */
  @UseGuards(JwtAuthGuard)
  @Roles(UserRole.CUSTOMER)
  @Post(':errandId/price-changes/:requestId/initiate')
  retryDifference(
    @Param('errandId', ParseUUIDPipe) errandId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @CurrentUser() user: AuthContext,
  ) {
    return this.payments.retryDifference(errandId, requestId, user);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':errandId')
  getForErrand(@Param('errandId') errandId: string, @CurrentUser() user: AuthContext) {
    return this.payments.listForErrand(errandId, user);
  }
}