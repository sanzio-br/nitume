import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
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

export class ReviewVerificationDto {
  @IsIn(['approved', 'rejected'])
  decision: 'approved' | 'rejected';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
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