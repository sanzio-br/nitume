import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { RefundPayoutCorrectionKind } from '../refund-payout-correction.entity';
import { RefundStatus } from '../refund-review.entity';

export class ListRefundsQueryDto {
  @IsOptional()
  @IsEnum(RefundStatus)
  status?: RefundStatus;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class CountRefundsQueryDto {
  @IsOptional()
  @IsEnum(RefundStatus)
  status?: RefundStatus;
}

export class DecideRefundDto {
  /** KES, 0 up to the amount the customer paid. 0 closes the review. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  refundAmount: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class MarkRefundPaidDto {
  /** M-Pesa receipt of the manual payout. */
  @IsString()
  @Matches(/^[A-Za-z0-9-]{4,64}$/, { message: 'payoutReference must be an M-Pesa receipt' })
  payoutReference: string;
}

/**
 * POST /refunds/:id/corrections (row 100, spec drawer-refund "Corrections").
 * - `corrected`: `newReference` and/or `newAmount` (at least one changed);
 * - `reversed`: `newReference` = the reversal M-Pesa code, no `newAmount`;
 * - `resent`: `newReference` and `newAmount` required.
 * `expectedLatestCorrectionId`: the latest correction id the admin saw, or
 * null when there was none (required key).
 */
export class CreateRefundPayoutCorrectionDto {
  @IsEnum(RefundPayoutCorrectionKind)
  kind: RefundPayoutCorrectionKind;

  @ValidateIf(
    (o: CreateRefundPayoutCorrectionDto) =>
      o.kind !== RefundPayoutCorrectionKind.CORRECTED ||
      (o.newReference !== undefined && o.newReference !== null),
  )
  @IsString()
  @Matches(/^\s*[A-Za-z0-9-]{4,64}\s*$/, {
    message: 'newReference must be an M-Pesa code (letters, digits, dashes)',
  })
  newReference?: string | null;

  /** KES, > 0, 2 dp, <= correctionCeiling. */
  @ValidateIf(
    (o: CreateRefundPayoutCorrectionDto) =>
      o.kind === RefundPayoutCorrectionKind.RESENT ||
      (o.newAmount !== undefined && o.newAmount !== null),
  )
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  newAmount?: number | null;

  /** Why (audit; never shown to customers). 5-500 characters after trimming. */
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;

  @ValidateIf((o: CreateRefundPayoutCorrectionDto) => o.expectedLatestCorrectionId !== null)
  @IsUUID()
  expectedLatestCorrectionId: string | null;
}
