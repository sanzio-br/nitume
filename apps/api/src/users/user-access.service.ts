import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StatusHistoryActor, UserRole, UserStatus } from '../common/enums';
import { RedisService } from '../infra/redis/redis.service';
import {
  cannotChangeAdminStatus,
  cannotChangeOwnStatus,
  isAllowedStatusTransition,
  normaliseStatusReason,
  statusTransitionNotAllowed,
  statusUnchanged,
  userNotFound,
} from './user-status.rules';
import { StatusHistoryItem, StatusWrite, UserStatusStore } from './user-status.store';
import { UserAccess, UsersService } from './users.service';

/**
 * Issue #23 (WQ-20): fallback lifetime of a cached account status. Every
 * status change made through `UserAccessService` overwrites the
 * cache at once, so the TTL only bounds staleness after a change made
 * outside the API (SQL, the seed script). Decided: owner WQ-21, 2026-10-28,
 * 60 seconds.
 */
export const USER_ACCESS_CACHE_TTL_SECONDS = 60;

/** Domain event emitted after an account status change is stored. */
export const USER_STATUS_CHANGED = 'user.status_changed';

export interface UserStatusChangedEvent {
  userId: string;
  status: UserStatus;
  from: UserStatus;
}

/** Result of an audited admin status change (issue #24). */
export interface AuditedStatusChange {
  user: { id: string; role: UserRole; status: UserStatus };
  /** The history row written in the same transaction. */
  change: StatusHistoryItem;
}

export const userAccessCacheKey = (userId: string): string => `user:access:${userId}`;

const STATUSES = new Set<string>(Object.values(UserStatus));
const ROLES = new Set<string>(Object.values(UserRole));

const parse = (raw: string | null): UserAccess | null => {
  if (!raw) {
    return null;
  }
  try {
    const v = JSON.parse(raw) as Partial<UserAccess>;
    if (
      typeof v.status === 'string' && STATUSES.has(v.status) &&
      typeof v.role === 'string' && ROLES.has(v.role) &&
      typeof v.phone === 'string'
    ) {
      return { status: v.status, role: v.role, phone: v.phone };
    }
  } catch {
    // A malformed entry is treated as a miss.
  }
  return null;
};

/**
 * Cheap account status for every authenticated request (HTTP guard and
 * Socket.IO handshake, issue #23): Redis first, the users table on a miss.
 *
 * Consistency: readers fill the cache with SET NX; `setStatus` and
 * `changeStatus` overwrite it after the database write with the value written
 * (versioned, so of two concurrent changes the later one wins), so a reader
 * that loaded the old row can never replace the new status. A Redis failure falls back to the database (the
 * status check itself never fails open).
 */
@Injectable()
export class UserAccessService {
  private readonly logger = new Logger(UserAccessService.name);

  constructor(
    private readonly users: UsersService,
    private readonly redis: RedisService,
    private readonly events: EventEmitter2,
    private readonly store: UserStatusStore,
  ) {}

  /** Status, role and phone of `userId`, or null if no such user. */
  async accessOf(userId: string): Promise<UserAccess | null> {
    const key = userAccessCacheKey(userId);
    try {
      const cached = parse(await this.redis.get(key));
      if (cached) {
        return cached;
      }
    } catch (err) {
      this.logger.warn(`User access cache read failed: ${message(err)}`);
    }
    const access = await this.users.accessOf(userId);
    if (access) {
      try {
        await this.redis.setIfAbsent(key, JSON.stringify(access), USER_ACCESS_CACHE_TTL_SECONDS);
      } catch (err) {
        this.logger.warn(`User access cache fill failed: ${message(err)}`);
      }
    }
    return access;
  }

  /**
   * Changes an account status (suspend, ban, reactivate) without an audit
   * row: for internal callers and tests. Admin changes go through
   * `changeStatus` (issue #24), which validates and audits them. The write
   * locks the user row; the cache is then overwritten from the value written
   * and, when the status changed, `user.status_changed` is emitted so the
   * realtime gateway disconnects the user's live sockets.
   */
  async setStatus(userId: string, status: UserStatus): Promise<UserStatusChangedEvent> {
    const written = await this.store.write(userId, status);
    if (!written) {
      throw new NotFoundException('User not found');
    }
    return this.publish(userId, written);
  }

  /**
   * Issue #24 (owner WQ-22 and WQ-23, 2026-10-28): an admin suspends, bans or
   * reactivates a user with a required internal reason. Checks, in order:
   * 400 `status_reason_invalid` (10-500 characters after trimming), 403
   * `cannot_change_own_status`, then on the locked row 404 `user_not_found`,
   * 403 `cannot_change_admin_status`, 409 `status_unchanged`, 409
   * `status_transition_not_allowed` (banned -> suspended). The status update
   * and the history row are one transaction; after commit the cache is
   * overwritten from the written value and `user.status_changed` is emitted.
   * Session revocation is the caller's job (`TokenService` lives in auth).
   */
  async changeStatus(input: {
    actorUserId: string;
    userId: string;
    status: UserStatus;
    reason: unknown;
  }): Promise<AuditedStatusChange> {
    const reason = normaliseStatusReason(input.reason);
    if (input.actorUserId === input.userId) {
      throw cannotChangeOwnStatus();
    }
    const to = input.status;
    const written = await this.store.write(input.userId, to, {
      audit: { actorType: StatusHistoryActor.ADMIN, actorUserId: input.actorUserId, reason },
      check: (current) => {
        if (current.role === UserRole.ADMIN) {
          throw cannotChangeAdminStatus();
        }
        if (current.status === to) {
          throw statusUnchanged(to);
        }
        if (!isAllowedStatusTransition(current.status, to)) {
          throw statusTransitionNotAllowed(current.status, to);
        }
      },
    });
    if (!written) {
      throw userNotFound();
    }
    if (!written.entry) {
      // Unreachable: `check` refuses an unchanged status, so a row is written.
      throw new Error('Status change wrote no history row');
    }
    await this.publish(input.userId, written);
    return {
      user: { id: input.userId, role: written.access.role, status: written.access.status },
      change: written.entry,
    };
  }

  /** After commit: cache from the written value, then the event if the status changed. */
  private async publish(userId: string, written: StatusWrite): Promise<UserStatusChangedEvent> {
    await this.writeCache(userId, written.access, written.version);
    const event: UserStatusChangedEvent = { userId, status: written.access.status, from: written.from };
    if (written.from !== written.access.status) {
      this.events.emit(USER_STATUS_CHANGED, event);
    }
    return event;
  }

  /**
   * Overwrites the cached entry with the value just written (not a re-read),
   * unless Redis already holds a newer version: the row lock orders the
   * database writes of one user, the version orders their cache writes.
   * Overwrite, not delete, so a concurrent reader holding the old row cannot
   * put it back (it fills with SET NX). If Redis is unreachable the key is
   * deleted as a best effort and the TTL bounds it.
   */
  private async writeCache(userId: string, access: UserAccess, version: number): Promise<void> {
    const key = userAccessCacheKey(userId);
    try {
      await this.redis.setIfNotOlder(key, JSON.stringify({ ...access, v: version }), version, USER_ACCESS_CACHE_TTL_SECONDS);
    } catch (err) {
      this.logger.error(`User access cache write failed for ${userId}: ${message(err)}`);
      await this.redis.del(key).catch(() => undefined);
    }
  }
}

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));
