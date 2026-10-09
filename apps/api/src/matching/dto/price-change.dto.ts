import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PriceChangeStatus } from '../../common/enums';
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

export class ErrandIdParamsDto {
  @IsUUID()
  errandId: string;
}

export class ListPriceChangesQueryDto {
  /** e.g. `?status=requested` for the pending request the customer must decide. */
  @IsOptional()
  @IsEnum(PriceChangeStatus)
  status?: PriceChangeStatus;
}

export type PriceChangeResult = PriceChangeRequest;