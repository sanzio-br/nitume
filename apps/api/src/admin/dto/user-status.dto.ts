import { Type } from 'class-transformer';
import { Allow, IsEnum, IsInt, IsOptional, IsString, Max, Min, MaxLength } from 'class-validator';
import { UserStatus } from '../../common/enums';
import { STATUS_HISTORY_MAX_LIMIT } from '../../users/user-status.store';

/**
 * PATCH /admin/users/:id/status (issue #24). `reason` is checked by the
 * service so every bad value (missing, not text, outside 10-500 characters
 * after trimming) answers the coded 400 `status_reason_invalid`.
 */
export class ChangeUserStatusDto {
  @IsEnum(UserStatus)
  status: UserStatus;

  @Allow()
  reason?: unknown;
}

/** GET /admin/users/:id/status-history (issue #24): `limit` 1-50, default 20. */
export class UserStatusHistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(STATUS_HISTORY_MAX_LIMIT)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;
}
