import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class OpenDisputeDto {
  @IsUUID()
  errandId: string;

  /** What went wrong, in the customer's words (stored on the dispute). */
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;
}

export class DisputeIdParamsDto {
  @IsUUID()
  id: string;
}
