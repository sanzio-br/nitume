import { IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { MerchantRoute } from '../payment-views';

export class InitiatePaymentDto {
  /**
   * How the merchant/item amount is paid. Required when the errand has a
   * merchant amount. Runner advance is not a customer option.
   */
  @IsOptional()
  @IsEnum(MerchantRoute)
  merchantRoute?: MerchantRoute;

  /** Saved M-Pesa method to charge; defaults to the default method, then the login phone. */
  @IsOptional()
  @IsUUID()
  paymentMethodId?: string;
}

export class MpesaCallbackDto {
  /** The `mpesaReference` returned by `POST /payments/:errandId/initiate`. */
  @IsString()
  @MaxLength(64)
  reference: string;

  /** 0 = success (Daraja ResultCode convention). */
  @IsInt()
  @Min(0)
  resultCode: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  resultDesc?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  receiptNumber?: string;

  @IsOptional()
  @IsIn(['unbound', 'C2B', 'B2C', 'STK', 'reversal', 'mock'])
  mpesaType?: string;
}