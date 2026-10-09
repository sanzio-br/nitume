import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerProfile } from '../customers/customer-profile.entity';
import { CustomersModule } from '../customers/customers.module';
import { ErrandsModule } from '../errands/errands.module';
import { Payment } from './payment.entity';
import { PaymentTransaction } from './payment-transaction.entity';
import { PaymentType } from './payment-type.entity';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { RefundReview } from './refund-review.entity';
import { RefundsController } from './refunds.controller';
import { RefundsService } from './refunds.service';
import { ConsoleStkGateway } from './stk-gateway/console-stk-gateway';
import { stkGatewayProvider } from './stk-gateway/stk-gateway.provider';

@Module({
  imports: [
    ErrandsModule,
    CustomersModule,
    TypeOrmModule.forFeature([
      Payment,
      PaymentTransaction,
      PaymentType,
      CustomerProfile,
      RefundReview,
    ]),
  ],
  controllers: [PaymentsController, RefundsController],
  providers: [PaymentsService, RefundsService, ConsoleStkGateway, stkGatewayProvider],
  exports: [PaymentsService],
})
export class PaymentsModule {}