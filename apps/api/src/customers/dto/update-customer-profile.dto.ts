import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateCustomerProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  defaultAddressText?: string | null;
}