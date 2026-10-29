import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { AuthContext, Roles } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/enums';
import { AuditedStatusChange } from '../users/user-access.service';
import { StatusHistoryPage } from '../users/user-status.store';
import { AdminUserSummary } from '../users/users.service';
import { ChangeUserStatusDto, UserStatusHistoryQueryDto } from './dto/user-status.dto';
import { UserStatusService } from './user-status.service';

/** Issue #24: account status actions for ops (admin role only, owner WQ-22). */
@Controller('admin/users')
@Roles(UserRole.ADMIN)
export class AdminUsersController {
  constructor(private readonly statuses: UserStatusService) {}

  /**
   * U-1 (issue #24, owner 2026-10-29): the account for the admin Customer
   * drawer. 200 `{ id, role, status, displayName, phone }` (`displayName`
   * null until set; `phone` is the full sign-in number). Any role, admins
   * included. Errors: 400 (id not a UUID); 403 for a non-admin; 404
   * user_not_found.
   */
  @Get(':id')
  summary(@Param('id', ParseUUIDPipe) id: string): Promise<AdminUserSummary> {
    return this.statuses.summary(id);
  }

  /**
   * Suspend, ban or reactivate a customer, runner or business account.
   * Body `{ status: 'active' | 'suspended' | 'banned', reason }` (reason
   * internal, 10-500 characters after trimming, never shown to the user).
   * Allowed: active <-> suspended, active -> banned, suspended -> banned,
   * banned -> active. 200 `{ user { id, role, status }, change }` where
   * `change` is the new history item (same shape as the history list).
   * Takes effect at once: access tokens answer 401 `account_suspended`, live
   * sockets are dropped, refresh sessions are revoked (a reactivated user
   * signs in again with OTP).
   * Errors: 400 (validation: unknown status, id not a UUID); 400
   * status_reason_invalid (`minLength`, `maxLength`); 403 for a non-admin;
   * 403 cannot_change_own_status; 403 cannot_change_admin_status; 404
   * user_not_found; 409 status_unchanged (`status`); 409
   * status_transition_not_allowed (`from`, `to`, `allowed`).
   */
  @Patch(':id/status')
  changeStatus(
    @CurrentUser() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeUserStatusDto,
  ): Promise<AuditedStatusChange> {
    return this.statuses.change(actor.userId, id, dto.status, dto.reason);
  }

  /**
   * Status history of a user, newest first: `?cursor&limit` (1-50, default
   * 20) -> `{ items, nextCursor }`. Item `{ id, fromStatus, toStatus, reason,
   * actorType, actor { id, displayName } | null, createdAt }`.
   * Errors: 400 (validation); 400 cursor_invalid; 403 for a non-admin; 404
   * user_not_found.
   */
  @Get(':id/status-history')
  statusHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: UserStatusHistoryQueryDto,
  ): Promise<StatusHistoryPage> {
    return this.statuses.history(id, { cursor: query.cursor, limit: query.limit });
  }
}
