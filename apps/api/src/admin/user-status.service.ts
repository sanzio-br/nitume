import { Injectable, Logger } from '@nestjs/common';
import { TokenService } from '../auth/token.service';
import { UserStatus } from '../common/enums';
import { AuditedStatusChange, UserAccessService } from '../users/user-access.service';
import { userNotFound } from '../users/user-status.rules';
import { StatusHistoryPage, UserStatusStore } from '../users/user-status.store';
import { AdminUserSummary, UsersService } from '../users/users.service';

/**
 * Issue #24 (owner WQ-22 and WQ-23, 2026-10-28): admin suspend, ban and
 * reactivate, with the audit history.
 */
@Injectable()
export class UserStatusService {
  private readonly logger = new Logger(UserStatusService.name);

  constructor(
    private readonly access: UserAccessService,
    private readonly store: UserStatusStore,
    private readonly tokens: TokenService,
    private readonly users: UsersService,
  ) {}

  /** U-1: the account as the admin Customer drawer shows it; 404 `user_not_found`. */
  async summary(userId: string): Promise<AdminUserSummary> {
    const user = await this.users.summaryOf(userId);
    if (!user) {
      throw userNotFound();
    }
    return user;
  }

  /**
   * Changes `userId`'s status as admin `actorId`. The status update and the
   * history row are one transaction under the user row lock; after commit
   * the access cache is written from the new value and `user.status_changed`
   * is emitted (live sockets of a suspended or banned user are dropped), all
   * in `UserAccessService.changeStatus`. Then every refresh session is
   * revoked on suspend or ban (owner WQ-23) and, so that reactivation always
   * needs a fresh OTP sign-in even if an earlier revocation failed or the
   * status was set outside the API, on reactivation too. A revocation
   * failure is logged, never undoes the committed change.
   */
  async change(actorId: string, userId: string, toStatus: UserStatus, reason: unknown): Promise<AuditedStatusChange> {
    const result = await this.access.changeStatus({ actorUserId: actorId, userId, status: toStatus, reason });
    try {
      await this.tokens.revokeAllForUser(userId);
    } catch (err) {
      this.logger.error(
        `Refresh sessions of ${userId} not revoked after ${result.change.fromStatus} -> ${toStatus}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return result;
  }

  /** Newest first; 404 `user_not_found`; 400 `cursor_invalid`. */
  async history(userId: string, opts: { cursor?: string | null; limit?: number }): Promise<StatusHistoryPage> {
    const page = await this.store.list(userId, opts);
    if (!page) {
      throw userNotFound();
    }
    return page;
  }
}
