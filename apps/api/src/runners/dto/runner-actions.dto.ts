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
}

/** POST /runners/verifications/:id/re-review (row 171): optional note, <= 500 after trim. */
export class ReReviewVerificationDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
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