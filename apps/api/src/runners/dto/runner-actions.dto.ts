import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  RunnerAvailability,
  RunnerSkill,
  RunnerVerificationType,
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

  @IsOptional()
  @IsString()
  @MaxLength(255)
  documentS3Key?: string;
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