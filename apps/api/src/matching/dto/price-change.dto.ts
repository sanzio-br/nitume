import { IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { PriceChangeRequest } from '../price-change-request.entity';

export class RequestPriceChangeDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(10_000_000)
  toPrice: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class PriceChangeRequestParamsDto {
  @IsUUID()
  errandId: string;

  @IsUUID()
  requestId: string;
}

export type PriceChangeResult = PriceChangeRequest;