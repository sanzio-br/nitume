import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsEmail({}, { message: 'Invalid email address' })
  @MaxLength(255)
  email?: string;

  /** Name shown to the other party. 2-80 characters, letters/spaces/'.-. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Matches(/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u, {
    message: "displayName may contain letters, spaces, apostrophes, dots and hyphens",
  })
  displayName?: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MaxLength(128)
  newPassword: string;
}