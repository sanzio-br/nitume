import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
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
