import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  RunnerAvailability,
  RunnerSkill,
  RunnerVerificationType,
  VerificationStatus,
} from '../../common/enums';

export class SetAvailabilityDto {
  @IsEnum(RunnerAvailability)
  @Type(() => String)
  availability: RunnerAvailability;
}

export class AddVerificationDto {
  @IsEnum(RunnerVerificationType)
  @Type(() => String)
  verificationType: RunnerVerificationType;

  /**
   * No longer accepted (row 154: keys are server-side only); sending it is
   * 400 verification_document_upload_required. Kept so the error is coded.
   */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  documentS3Key?: string;
}

/** Multipart field next to `file` on POST /runners/me/verifications/documents (RA-7). */
export class UploadVerificationDocumentDto {
  @IsIn([RunnerVerificationType.GOVERNMENT_ID, RunnerVerificationType.SELFIE])
  verificationType: RunnerVerificationType.GOVERNMENT_ID | RunnerVerificationType.SELFIE;

  /**
   * Row 195: `front` | `back` (case-insensitive), required for
   * government_id, not allowed for selfie. Checked by the service so the
   * error carries `verification_document_side_invalid`.
   */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  side?: string;
}

/**
 * POST /runners/verifications/:id/re-review (rows 171, 180): optional note,
 * at most 500 characters after trimming (checked by the service:
 * 400 re_review_note_invalid); a blank note is stored as null.
 */
export class ReReviewVerificationDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

/**
 * PATCH /runners/:runnerId/verifications/:verificationId. `reviewerNote`
 * (row 262): optional, internal, at most 500 characters after trimming
 * (checked by the service: 400 reviewer_note_invalid); blank is stored as
 * null. The DTO cap only stops oversized bodies.
 */
export class ReviewVerificationDto {
  @IsIn(['approved', 'rejected'])
  decision: 'approved' | 'rejected';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reviewerNote?: string;
}

export class SetSkillsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsEnum(RunnerSkill, { each: true })
  skills: RunnerSkill[];
}

export class SetServiceAreasDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  areas: string[];
}

export class ListVerificationsQueryDto {
  @IsOptional()
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsEnum(VerificationStatus)
  @Type(() => String)
  status?: VerificationStatus;
}

/**
 * GET /runners/verifications/queue (row 260). `status` defaults to `pending`.
 * Row 278 (AV-2): `serviceAreaId`, `level` and `q` are checked by the service
 * (400 service_area_invalid, level_invalid, search_query_invalid with a
 * stable code); the caps here only stop oversized query strings.
 */
export class VerificationQueueQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @IsOptional()
  @IsIn([...Object.values(VerificationStatus), 'all'])
  status?: VerificationStatus | 'all';

  @IsOptional()
  @IsString()
  @MaxLength(64)
  serviceAreaId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  level?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  q?: string;
}
