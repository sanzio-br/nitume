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
 * POST /refunds/:id/corrections (row 100). Correction: `newPayoutReference`
 * required, `amount` optional (defaults to the current effective amount).
 * Reversal: `newPayoutReference` optional (M-Pesa reversal id), no `amount`.
 */
export class CreateRefundPayoutCorrectionDto {
  @IsEnum(RefundPayoutCorrectionKind)
  kind: RefundPayoutCorrectionKind;

  @ValidateIf(
    (o: CreateRefundPayoutCorrectionDto) =>
      o.kind === RefundPayoutCorrectionKind.CORRECTION ||
      (o.newPayoutReference !== undefined && o.newPayoutReference !== null),
  )
  @IsString()
  @Matches(/^[A-Za-z0-9-]{4,64}$/, { message: 'newPayoutReference must be an M-Pesa receipt' })
  newPayoutReference?: string | null;

  /** KES. Correction only: the amount paid under the new receipt. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount?: number;

  /** Why the payout is corrected or reversed (audit; never shown to customers). */
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason: string;
}
