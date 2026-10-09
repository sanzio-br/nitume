import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthContext, Public } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { InitiatePaymentDto, MpesaCallbackDto } from './dto/payment.dto';
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

  @Public()
  @Post('mpesa/callback')
  async mpesaCallback(@Body() dto: MpesaCallbackDto): Promise<{ received: true }> {
    await this.payments.handleCallback(dto);
    return { received: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get(':errandId')
  getForErrand(@Param('errandId') errandId: string, @CurrentUser() user: AuthContext) {
    return this.payments.listForErrand(errandId, user);
  }
}