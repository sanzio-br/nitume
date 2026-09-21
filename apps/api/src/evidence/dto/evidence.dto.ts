import { Type } from 'class-transformer';
import {
  IsBase64,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsISO8601,
  MaxLength,
  Min,
} from 'class-validator';
import { EvidenceType, UserRole } from '../../common/enums';

export class CreateEvidenceDto {
  @IsEnum(EvidenceType)
  type: EvidenceType;

  /** Base64-encoded asset bytes (no mime prefix). */
  @IsBase64()
  data: string;

  /** MIME type of `data` (e.g. image/jpeg, image/png, video/mp4). */
  @IsString()
  @MaxLength(100)
  contentType: string;

  @IsOptional()
  @IsISO8601()
  capturedAt?: string;

  @IsOptional()
  @IsLongitude()
  lon?: number;

  @IsOptional()
  @IsLatitude()
  lat?: number;
}

export class ListEvidenceQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number;
}

export interface EvidenceViewerContext {
  userId: string;
  role: UserRole;
}

export class UploadEvidenceParamsDto {
  @IsString()
  errandId: string;
}