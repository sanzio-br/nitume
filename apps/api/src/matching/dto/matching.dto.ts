import { Type } from 'class-transformer';
import { AssignmentDeclineReason } from '../../common/enums';
import {
  IsIn,
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
/**
 * POST /errands/:id/assignment/decline (row 108, legacy over-limit route):
 * only `over_purchase_limit`. The general decline takes the row-210 reasons.
 */
export class DeclineAssignmentDto {
  @IsIn([AssignmentDeclineReason.OVER_PURCHASE_LIMIT])
  reason: AssignmentDeclineReason;
}

export class PurchaseCheckQueryDto {
  @IsOptional()
  @IsUUID()
  runnerProfileId?: string;
}

/**
 * POST /errands/:id/decline (rows 113, 134, 210, 229). `reason` is required:
 * `over_purchase_limit` (checked against the limit), `too_far`,
 * `not_available` or `other` (stored as given). Missing or any other value:
 * 400 decline_reason_invalid with `allowed` (checked by the controller, so
 * the error carries its code).
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

/** GET /errands/:id/candidates (N-20). */
export class ListCandidatesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  cursor?: string;
}
