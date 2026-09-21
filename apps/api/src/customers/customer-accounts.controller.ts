import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthContext } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CreateSavedAddressDto, UpdateSavedAddressDto } from './dto/address.dto';
import {
  CreatePaymentMethodDto,
  UpdatePaymentMethodDto,
} from './dto/payment-method.dto';
import { SavedAddress } from './saved-address.entity';
import { PaymentMethod } from './payment-method.entity';
import { CustomerAccountsService } from './customer-accounts.service';

@Controller('customers/me')
@UseGuards(JwtAuthGuard)
export class CustomerAccountsController {
  constructor(private readonly accounts: CustomerAccountsService) {}

  @Get('addresses')
  listAddresses(@CurrentUser() user: AuthContext): Promise<SavedAddress[]> {
    return this.accounts.listAddresses(user.userId);
  }

  @Post('addresses')
  createAddress(
    @CurrentUser() user: AuthContext,
    @Body() dto: CreateSavedAddressDto,
  ): Promise<SavedAddress> {
    return this.accounts.createAddress(user.userId, dto);
  }

  @Patch('addresses/:id')
  updateAddress(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateSavedAddressDto,
  ): Promise<SavedAddress> {
    return this.accounts.updateAddress(user.userId, id, dto);
  }

  @Post('addresses/:id/default')
  setDefaultAddress(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
  ): Promise<SavedAddress> {
    return this.accounts.setDefaultAddress(user.userId, id);
  }

  @Delete('addresses/:id')
  removeAddress(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
  ): Promise<{ removed: boolean }> {
    return this.accounts.removeAddress(user.userId, id);
  }

  @Get('payment-methods')
  listPaymentMethods(@CurrentUser() user: AuthContext): Promise<PaymentMethod[]> {
    return this.accounts.listPaymentMethods(user.userId);
  }

  @Post('payment-methods')
  createPaymentMethod(
    @CurrentUser() user: AuthContext,
    @Body() dto: CreatePaymentMethodDto,
  ): Promise<PaymentMethod> {
    return this.accounts.createPaymentMethod(user.userId, dto);
  }

  @Patch('payment-methods/:id')
  updatePaymentMethod(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdatePaymentMethodDto,
  ): Promise<PaymentMethod> {
    return this.accounts.updatePaymentMethod(user.userId, id, dto);
  }

  @Delete('payment-methods/:id')
  removePaymentMethod(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
  ): Promise<{ removed: boolean }> {
    return this.accounts.removePaymentMethod(user.userId, id);
  }
}