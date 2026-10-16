import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { RunnerPayoutLineStatus, RunnerPayoutLineType } from '../runner-payout-line.entity';
import { MAX_BATCH_LINES, PAYOUT_FEED_KINDS, PayoutFeedKind } from '../runner-payouts.service';

const EFFECTIVE_STATUSES = [
  RunnerPayoutLineStatus.ON_HOLD,
  RunnerPayoutLineStatus.PAYABLE,
  RunnerPayoutLineStatus.PAID,
  RunnerPayoutLineStatus.REJECTED,
] as const;

const OBLIGATION_TYPES = [RunnerPayoutLineType.RUNNER_FEE, RunnerPayoutLineType.ITEM_REIMBURSEMENT] as const;

const ADJUSTMENT_KINDS = [
  RunnerPayoutLineType.CORRECTION,
  RunnerPayoutLineType.REVERSAL,
  RunnerPayoutLineType.RESENT_PAYOUT,
] as const;

const MPESA_CODE = /^\s*[A-Za-z0-9-]{4,64}\s*$/;

/**
 * GET /runners/me/payout-lines. `kind`: one or more of runner_fee,
 * item_reimbursement, payout, correction, reversal, resent_payout
 * (comma-separated or repeated). `errandId`: one task's lines (RA-16).
 */
export class ListPayoutLinesQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    (Array.isArray(value) ? value : [value]).flatMap((v) => String(v).split(',')).filter(Boolean),
  )
  @IsArray()
  @IsIn(PAYOUT_FEED_KINDS, { each: true })
  kind?: PayoutFeedKind[];

  @IsOptional()
  @IsUUID()
  errandId?: string;

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

/** Admin list filters (shared fields). `status` is the effective status (a reversed payout is `payable`). */
export class ListMyPayoutsQueryDto {
  @IsOptional()
  @IsIn(EFFECTIVE_STATUSES)
  status?: (typeof EFFECTIVE_STATUSES)[number];

  @IsOptional()
  @IsIn(OBLIGATION_TYPES)
  kind?: (typeof OBLIGATION_TYPES)[number];

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

/** GET /runner-payouts (admin). */
export class ListRunnerPayoutsQueryDto extends ListMyPayoutsQueryDto {
  @IsOptional()
  @IsUUID()
  runnerProfileId?: string;

  @IsOptional()
  @IsUUID()
  errandId?: string;
}

export class CountRunnerPayoutsQueryDto {
  @IsOptional()
  @IsIn(EFFECTIVE_STATUSES)
  status?: (typeof EFFECTIVE_STATUSES)[number];
}

/** GET /runners/me/earnings and GET /runner-payouts/summary. Dates are YYYY-MM-DD in EAT. */
export class EarningsQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must be YYYY-MM-DD' })
  to?: string;

  @IsOptional()
  @IsIn(['day', 'week', 'month'])
  groupBy?: 'day' | 'week' | 'month';
}

export class RunnerSummaryQueryDto extends EarningsQueryDto {
  @IsUUID()
  runnerProfileId: string;
}

/** POST /runners/me/reimbursement-claims (row 106). */
export class CreateReimbursementClaimDto {
  @IsUUID()
  errandId: string;

  /** KES, > 0, 2 dp, at most the item amount paid to Nitume. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  /** Receipt evidence (type `receipt`) the runner uploaded on this task. */
  @IsUUID()
  receiptEvidenceId: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/** POST /runner-payouts/:id/review. `amount` required to approve; `note` (5-500) required to reject. */
export class ReviewRunnerPayoutDto {
  @IsIn(['approve', 'reject'])
  decision: 'approve' | 'reject';

  @ValidateIf((o: ReviewRunnerPayoutDto) => o.decision === 'approve')
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
  /**
   * Row 136: override the task's combined cap (customer refunds + runner item
   * reimbursement <= paid to Nitume), with the reason (10-500). Audited; only
   * needed after 409 task_exposure_cap_exceeded.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  exposureOverrideNote?: string;

  /**
   * Row 142 / 151 (N-21): reason for approving above the runner's purchase
   * limit (10-500 characters, checked by the service so the error carries
   * `purchase_limit_override_note_invalid`). Only used when the amount is
   * above `approvalCeiling`; ignored otherwise: not validated, not stored,
   * no `task_exposure_overrides` row (review minor 10).
   */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  purchaseLimitOverrideNote?: string;
}

/** POST /runner-payouts/:id/hold (receipt mismatch). */
export class HoldRunnerPayoutDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  note: string;
}

/** POST /runner-payouts/mark-paid: one M-Pesa payout for 1-50 payable lines of one runner. */
export class MarkRunnerPayoutsPaidDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BATCH_LINES)
  @IsUUID('all', { each: true })
  lineIds: string[];

  @IsString()
  @Matches(MPESA_CODE, { message: 'payoutReference must be an M-Pesa receipt' })
  payoutReference: string;
}

/**
 * POST /runner-payouts/:id/corrections (same rules as refund corrections).
 * - `correction`: `newReference` and/or `newAmount` (at least one changed);
 * - `reversal`: `newReference` = the reversal M-Pesa code, no `newAmount`;
 * - `resend`: `newReference` and `newAmount` required.
 */
export class CreateRunnerPayoutCorrectionDto {
  @IsIn(ADJUSTMENT_KINDS)
  kind: (typeof ADJUSTMENT_KINDS)[number];

  @ValidateIf(
    (o: CreateRunnerPayoutCorrectionDto) =>
      o.kind !== RunnerPayoutLineType.CORRECTION || (o.newReference !== undefined && o.newReference !== null),
  )
  @IsString()
  @Matches(MPESA_CODE, { message: 'newReference must be an M-Pesa code (letters, digits, dashes)' })
  newReference?: string | null;

  @ValidateIf(
    (o: CreateRunnerPayoutCorrectionDto) =>
      o.kind === RunnerPayoutLineType.RESENT_PAYOUT || (o.newAmount !== undefined && o.newAmount !== null),
  )
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  newAmount?: number | null;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;

  @ValidateIf((o: CreateRunnerPayoutCorrectionDto) => o.expectedLatestCorrectionId !== null)
  @IsUUID()
  expectedLatestCorrectionId: string | null;
}

/** POST /runners/me/payout-requests (rows 117, 153). The destination is set by the server (row 118). */
export class CreatePayoutRequestDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;
}

export class ListMyPayoutRequestsQueryDto {
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

const REQUEST_STATUSES = ['requested', 'paid', 'rejected', 'cancelled'] as const;

export class ListPayoutRequestsQueryDto extends ListMyPayoutRequestsQueryDto {
  @IsOptional()
  @IsIn(REQUEST_STATUSES)
  status?: (typeof REQUEST_STATUSES)[number];

  @IsOptional()
  @IsUUID()
  runnerProfileId?: string;
}

export class CountPayoutRequestsQueryDto {
  @IsOptional()
  @IsIn(REQUEST_STATUSES)
  status?: (typeof REQUEST_STATUSES)[number];
}

/** POST /runner-payout-requests/:id/pay: whole payable lines of the runner, total at most the request. */
export class PayPayoutRequestDto extends MarkRunnerPayoutsPaidDto {}

/** POST /runner-payout-requests/:id/reject: reason shown to the runner (5-300, checked by the service). */
export class RejectPayoutRequestDto {
  @IsString()
  @MaxLength(1000)
  note: string;
}

/** POST /runner-payout-requests/:id/cancel (row 166): mandatory ops reason (10-500, checked by the service). */
export class CancelPayoutRequestDto {
  @IsString()
  @MaxLength(1000)
  reason: string;
}
