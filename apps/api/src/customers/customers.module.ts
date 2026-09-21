import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerProfile } from './customer-profile.entity';
import { SavedAddress } from './saved-address.entity';
import { PaymentMethod } from './payment-method.entity';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { CustomerAccountsController } from './customer-accounts.controller';
import { CustomerAccountsService } from './customer-accounts.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CustomerProfile, SavedAddress, PaymentMethod]),
  ],
  controllers: [CustomersController, CustomerAccountsController],
  providers: [CustomersService, CustomerAccountsService],
  exports: [CustomersService, CustomerAccountsService],
})
export class CustomersModule {}