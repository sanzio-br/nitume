import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { durationSeconds } from '../common/duration';
import { UserStatus } from '../common/enums';
import { RedisService } from '../infra/redis/redis.service';
import { UserStatusStore } from './user-status.store';

/** Redis key of a user's "access tokens valid after" second (issue #24). */
export const userTokensValidAfterKey = (userId: string): string => `user:tokens-valid-after:${userId}`;

/**
 * Kept beyond the access-token lifetime, so the cut-off outlives every token
 * it refuses even with some clock skew between API instances.
 */
export const TOKEN_CUTOFF_TTL_MARGIN_SECONDS = 300;

/** Used only if `jwt.accessTtl` cannot be read; longer than any sane access TTL. */
const ACCESS_TTL_FALLBACK_SECONDS = 7 * 24 * 60 * 60;

/** Used only if `jwt.refreshTtl` cannot be read; the default refresh lifetime (30 days). */
const REFRESH_TTL_FALLBACK_SECONDS = 30 * 24 * 60 * 60;

/** Raises the stored second, never lowers it (concurrent changes), and (re)sets the TTL when it raises it. */
const RAISE_SCRIPT = `
local cur = tonumber(redis.call('GET', KEYS[1]))
local next = tonumber(ARGV[1])
if cur and cur >= next then
  return 0
end
redis.call('SET', KEYS[1], ARGV[1], 'EX', tonumber(ARGV[2]))
return 1
`;

/**
 * The cut-off second a status change sets, compared with a token's `iat`
 * (whole seconds): a token is refused when `iat < cutOff`.
 * - Suspend or ban: the second after the change, so every token issued up to
 *   and including that second is refused (a token from that very second may
 *   predate the change).
 * - Reactivation: the second of the change. Every token signed before it is
 *   refused too (none can be signed while suspended, so this only repeats the
 *   suspension's cut-off, in case that write was lost), while a token signed
 *   after the reactivation is accepted.
 */
export const cutOffSecondFor = (status: UserStatus, at: Date | number): number => {
  const second = Math.floor((typeof at === 'number' ? at : at.getTime()) / 1000);
  return status === UserStatus.ACTIVE ? second : second + 1;
};

/**
 * Issue #24 (owner, 2026-10-29): access tokens issued before a suspension or
 * ban stay refused after the account is reactivated. A per-user cut-off
 * second lives in Redis for the access-token lifetime plus a margin (after
 * that every older token has expired anyway); no schema change.
 *
 * Fail-safe: the cut-off is read from Redis on every authenticated request.
 * If Redis cannot be read (or holds garbage) the cut-off is rebuilt from the
 * audited `user_status_history` rows of that window, so a recently suspended
 * user is still refused, while every other user keeps working (no
 * all-users lock-out). If the database fallback fails too, the error
 * propagates and the request is refused (never fails open).
 */
@Injectable()
export class UserTokenCutoffService {
  private readonly logger = new Logger(UserTokenCutoffService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly store: UserStatusStore,
  ) {}

  /** Access-token lifetime + margin, in seconds: the TTL of the Redis key and the fallback window. */
  windowSeconds(): number {
    const accessTtl = durationSeconds(this.config.get<string>('jwt.accessTtl', '15m'), ACCESS_TTL_FALLBACK_SECONDS);
    return accessTtl + TOKEN_CUTOFF_TTL_MARGIN_SECONDS;
  }

  /**
   * After a committed status change to `status` at `at`: raises the user's
   * cut-off (never lowers it). Throws if Redis fails; the caller logs it.
   */
  async mark(userId: string, status: UserStatus, at: Date | number = Date.now()): Promise<void> {
    await this.redis.evalScript(RAISE_SCRIPT, [userTokensValidAfterKey(userId)], [
      cutOffSecondFor(status, at),
      this.windowSeconds(),
    ]);
  }

  /**
   * True when an access token of `userId` issued at `iat` (seconds) predates
   * the user's cut-off. A token without `iat` is refused once a cut-off exists.
   */
  async isRefused(userId: string, iat: number | undefined): Promise<boolean> {
    const cutOff = await this.cutOffOf(userId);
    if (cutOff === null) {
      return false;
    }
    return typeof iat !== 'number' || !Number.isFinite(iat) || iat < cutOff;
  }

  /** The cut-off second, or null when there is none in the window. */
  async cutOffOf(userId: string): Promise<number | null> {
    const stored = await this.readStored(userId);
    if (stored !== 'unreadable') {
      return stored;
    }
    return this.cutOffFromHistory(userId, this.windowSeconds());
  }

  /**
   * Issue #33 (owner WQ-39, 2026-10-29): true when a refresh session of
   * `userId` issued at `iat` (the refresh JWT's issue second) predates the
   * user's last suspension, ban or reactivation, i.e. it outlived the
   * revocations of #24 (`revokeAllForUser`), which run after commit and only
   * log on failure. Same rule as access tokens (`iat < cutOff`; no `iat` is
   * refused once a cut-off exists).
   *
   * A refresh session lives far longer than the Redis key (access-token
   * window), and a Redis outage that lost the revocations most likely lost
   * the cut-off write too, so the audited `user_status_history` (written in
   * the status-change transaction) is always read here, over the life of
   * the session, and combined with the Redis value when that is readable.
   * Refreshes are rare (once per access-token lifetime), so this is one
   * indexed query per refresh. If the database read fails the error
   * propagates and the refresh is refused (never fails open).
   */
  async isRefreshRefused(userId: string, iat: number | undefined): Promise<boolean> {
    const hasIat = typeof iat === 'number' && Number.isFinite(iat);
    const stored = await this.readStored(userId);
    const fromHistory = await this.cutOffFromHistory(userId, this.refreshWindowSeconds(hasIat ? iat : undefined));
    const cutOff = maxOf(stored === 'unreadable' ? null : stored, fromHistory);
    if (cutOff === null) {
      return false;
    }
    return !hasIat || (iat as number) < cutOff;
  }

  /**
   * How far back the status history is read for a refresh session issued at
   * `iat`: its age plus the margin (clock skew between the API and the
   * database), never more than the refresh lifetime plus the margin (an
   * older session no longer verifies). No `iat`: the whole refresh lifetime.
   */
  refreshWindowSeconds(iat?: number): number {
    const refreshTtl = durationSeconds(this.config.get<string>('jwt.refreshTtl', '30d'), REFRESH_TTL_FALLBACK_SECONDS);
    const max = refreshTtl + TOKEN_CUTOFF_TTL_MARGIN_SECONDS;
    if (iat === undefined) {
      return max;
    }
    const age = Math.max(0, Math.ceil(Date.now() / 1000) - Math.floor(iat));
    return Math.min(age + TOKEN_CUTOFF_TTL_MARGIN_SECONDS, max);
  }

  /** The Redis value, null when absent, 'unreadable' when Redis fails or holds garbage (logged). */
  private async readStored(userId: string): Promise<number | null | 'unreadable'> {
    try {
      const raw = await this.redis.get(userTokensValidAfterKey(userId));
      if (raw === null) {
        return null;
      }
      const value = Number(raw);
      if (Number.isSafeInteger(value) && value > 0) {
        return value;
      }
      this.logger.warn(`Malformed token cut-off for ${userId}; reading the status history instead`);
    } catch (err) {
      this.logger.warn(`Token cut-off read failed for ${userId}; reading the status history instead: ${message(err)}`);
    }
    return 'unreadable';
  }

  private async cutOffFromHistory(userId: string, withinSeconds: number): Promise<number | null> {
    const changes = await this.store.recentChanges(userId, withinSeconds);
    return changes.reduce<number | null>((max, c) => {
      const second = cutOffSecondFor(c.toStatus, c.createdAt);
      return max === null || second > max ? second : max;
    }, null);
  }
}

const maxOf = (a: number | null, b: number | null): number | null =>
  a === null ? b : b === null ? a : Math.max(a, b);

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));
