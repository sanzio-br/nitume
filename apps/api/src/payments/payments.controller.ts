import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthContext, Public } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { MpesaCallbackDto } from './dto/payment.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @UseGuards(JwtAuthGuard)
  @Post(':errandId/initiate')
  initiate(@Param('errandId') errandId: string, @CurrentUser() user: AuthContext) {
    return this.payments.initiate(errandId, user);
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