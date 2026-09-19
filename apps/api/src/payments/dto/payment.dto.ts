import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

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