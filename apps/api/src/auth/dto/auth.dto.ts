import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole } from '../../common/enums';

export class OtpRequestDto {
  @IsString()
  @Matches(/^(?:\+?254|0)([17]\d{8})$/, {
    message: 'Phone must be a valid Kenyan number (e.g. 0712345678 or +254712345678)',
  })
  phone: string;
}

export class OtpVerifyDto extends OtpRequestDto {
  @Matches(/^\d{6}$/, { message: 'Code must be a 6-digit number' })
  code: string;

  @IsOptional()
  @IsEnum(UserRole)
  @Type(() => String)
  role?: UserRole;
}

export class RegisterDto {
  @Matches(/^(?:\+?254|0)([17]\d{8})$/, {
    message: 'Phone must be a valid Kenyan number (e.g. 0712345678 or +254712345678)',
  })
  phone: string;

  @IsOptional()
  @IsEmail({}, { message: 'Invalid email address' })
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password?: string;

  @IsEnum(UserRole)
  @Type(() => String)
  role: UserRole;
}

export class RefreshTokenDto {
  @IsString()
  @MinLength(10)
  refreshToken: string;
}