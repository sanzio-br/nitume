import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UserRole, UserStatus } from '../common/enums';
import { RedisService } from '../infra/redis/redis.service';
import { UserAccess, UsersService } from './users.service';

/**
 * Issue #23 (WQ-20): fallback lifetime of a cached account status. Every
 * status change made through `UserAccessService.setStatus` overwrites the
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
 * Consistency: readers fill the cache with SET NX, `setStatus` overwrites it
 * after the database write, so a reader that loaded the old row can never
 * replace the new status. A Redis failure falls back to the database (the
 * status check itself never fails open).
 */
@Injectable()
export class UserAccessService {
  private readonly logger = new Logger(UserAccessService.name);

  constructor(
    private readonly users: UsersService,
    private readonly redis: RedisService,
    private readonly events: EventEmitter2,
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
   * Changes an account status (suspend, ban, reactivate). The cache is
   * overwritten immediately and, when the status changed, `user.status_changed`
   * is emitted so the realtime gateway disconnects the user's live sockets.
   */
  async setStatus(userId: string, status: UserStatus): Promise<UserStatusChangedEvent> {
    const from = await this.users.updateStatus(userId, status);
    if (from === null) {
      throw new NotFoundException('User not found');
    }
    await this.refresh(userId);
    const event: UserStatusChangedEvent = { userId, status, from };
    if (from !== status) {
      this.events.emit(USER_STATUS_CHANGED, event);
    }
    return event;
  }

  /**
   * Reloads the cached entry from the database (overwrite, not delete, so a
   * concurrent reader holding the old row cannot put it back). If Redis is
   * unreachable the key is deleted as a best effort and the TTL bounds it.
   */
  async refresh(userId: string): Promise<void> {
    const key = userAccessCacheKey(userId);
    const access = await this.users.accessOf(userId);
    try {
      if (access) {
        await this.redis.set(key, JSON.stringify(access), USER_ACCESS_CACHE_TTL_SECONDS);
      } else {
        await this.redis.del(key);
      }
    } catch (err) {
      this.logger.error(`User access cache refresh failed for ${userId}: ${message(err)}`);
      await this.redis.del(key).catch(() => undefined);
    }
  }
}

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));
