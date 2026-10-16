import { Type } from 'class-transformer';
import { AssignmentDeclineReason } from '../../common/enums';
import {
  IsEnum,
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
/** POST /errands/:id/assignment/decline (row 108). Only `over_purchase_limit` today. */
export class DeclineAssignmentDto {
  @IsEnum(AssignmentDeclineReason)
  reason: AssignmentDeclineReason;
}

export class PurchaseCheckQueryDto {
  @IsOptional()
  @IsUUID()
  runnerProfileId?: string;
}

/**
 * POST /errands/:id/decline (rows 113, 134). `reason` is optional; the only
 * stored value is `over_purchase_limit` (checked against the limit). Any
 * other value: 400 decline_reason_invalid (checked by the controller).
 */
export class DeclineOfferDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  reason?: string;
}

export class ListOffersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;
}
