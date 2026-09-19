import { Type } from 'class-transformer';
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

  @IsString()
  @MinLength(5)
  @MaxLength(4000)
  description: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  budget: number;

  @IsOptional()
  @IsISO8601({ strict: true })
  deadlineAt?: string;

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

export class ListErrandsQueryDto {
  @IsOptional()
  @IsEnum(ErrandStatus)
  status?: ErrandStatus;

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