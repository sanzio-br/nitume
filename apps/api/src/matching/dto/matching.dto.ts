import { Type } from 'class-transformer';
import {
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class QuoteErrandDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(10_000_000)
  total: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  baseFee?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  distanceFee?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  timeFee?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  urgencyFee?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  complexityFee?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  premiumFee?: number;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  /**
   * Every quote expires (row 83). Omit for now + QUOTES_DEFAULT_TTL_HOURS
   * (24h); null is refused (only `undefined` skips validation).
   */
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsISO8601({ strict: true })
  expiresAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class AssignErrandDto {
  @IsUUID()
  runnerProfileId: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ListRunnersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
}