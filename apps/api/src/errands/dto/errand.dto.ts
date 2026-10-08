import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  ErrandCategory,
  ErrandPointType,
  ErrandStatus,
  ErrandUrgency,
  ResolveDisputeVerdict,
} from '../../common/enums';

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class ErrandLocationDto {
  @IsEnum(ErrandPointType)
  pointType: ErrandPointType;

  @IsLongitude()
  lon: number;

  @IsLatitude()
  lat: number;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  addressText: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  placeId?: string;
}

export class ErrandItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999)
  quantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  unit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class CreateErrandDto {
  @IsEnum(ErrandCategory)
  category: ErrandCategory;

  /** Optional short title shown on task cards (customer-provided). */
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title?: string;

  @IsString()
  @MinLength(5)
  @MaxLength(4000)
  description: string;

  /**
   * Merchant/item budget (row 45). Required for buy_for_me and
   * pickup_delivery (0 allowed); other categories may omit it or send 0,
   * and a positive budget there is refused (400 budget_not_applicable).
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  budget?: number;

  @IsOptional()
  @IsISO8601({ strict: true })
  deadlineAt?: string;

  /**
   * Deprecated and ignored: urgency is derived from `deadlineAt` on the
   * server. Still accepted so older clients do not get a 400.
   */
  @IsOptional()
  @IsEnum(ErrandUrgency)
  urgency?: ErrandUrgency;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ErrandLocationDto)
  locations: ErrandLocationDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ErrandItemDto)
  items?: ErrandItemDto[];
}

export class UpdateErrandDto {
  /** New title; `null` clears it. */
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title?: string | null;
}

export class RunnerNotesDto {
  /** Runner's notes for the customer's evidence review; `null` clears them. */
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(2000)
  runnerNotes: string | null;
}

export class TransitionErrandDto {
  @IsEnum(ErrandStatus)
  to: ErrandStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ResolveDisputeDto {
  @IsEnum(ResolveDisputeVerdict)
  verdict: ResolveDisputeVerdict;

  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  rationale: string;
}

/**
 * Accepts `status=A`, `status=A,B` or repeated `status=A&status=B` and
 * normalises to a de-duplicated array.
 */
const toStatusList = ({ value }: { value: unknown }): unknown => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const raw = Array.isArray(value) ? value : [value];
  const parts = raw
    .flatMap((v) => String(v).split(','))
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
  return [...new Set(parts)];
};

export class ErrandStatusFilterDto {
  /** One or more statuses: `status=IN_PROGRESS,ARRIVED`. */
  @IsOptional()
  @Transform(toStatusList)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(17)
  @IsEnum(ErrandStatus, { each: true })
  status?: ErrandStatus[];
}

export class ListErrandsQueryDto extends ErrandStatusFilterDto {

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
/**
 * Admin sets the merchant Till/Paybill details of an errand (rows 42-44).
 * Exactly one of `tillNumber` / `paybillNumber`; `accountReference` only
 * with a Paybill.
 */
export class MerchantDetailsDto {
  @Transform(trimString)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  merchantName: string;

  @IsOptional()
  @Matches(/^\d{5,10}$/, { message: 'tillNumber must be 5-10 digits' })
  tillNumber?: string;

  @IsOptional()
  @Matches(/^\d{5,10}$/, { message: 'paybillNumber must be 5-10 digits' })
  paybillNumber?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  accountReference?: string;
}
