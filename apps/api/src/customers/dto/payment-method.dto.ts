import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { PaymentMethodType } from '../../common/enums';

export class CreatePaymentMethodDto {
  /** Only M-Pesa in the MVP (cards are out of scope); other enum values stay in the DB. */
  @IsIn([PaymentMethodType.MPESA], { message: 'type must be mpesa' })
  type: PaymentMethodType;

  @IsString()
  @MaxLength(100)
  label: string;

  /** Masked detail (e.g. "+2547•• •••••887"). */
  @IsString()
  @MaxLength(100)
  detail: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{9,15}$/, {
    message: 'phoneNumber must be a valid phone number',
  })
  phoneNumber?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdatePaymentMethodDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  detail?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}