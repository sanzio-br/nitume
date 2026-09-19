import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerProfile } from '../customers/customer-profile.entity';
import { ErrandsModule } from '../errands/errands.module';
import { Payment } from './payment.entity';
import { PaymentTransaction } from './payment-transaction.entity';
import { PaymentType } from './payment-type.entity';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { ConsoleStkGateway } from './stk-gateway/console-stk-gateway';
import { stkGatewayProvider } from './stk-gateway/stk-gateway.provider';

@Module({
  imports: [
    ErrandsModule,
    TypeOrmModule.forFeature([Payment, PaymentTransaction, PaymentType, CustomerProfile]),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, ConsoleStkGateway, stkGatewayProvider],
})
export class PaymentsModule {}