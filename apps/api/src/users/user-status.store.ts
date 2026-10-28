import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiError } from '../common/api-error';
import { StatusHistoryActor, UserRole, UserStatus } from '../common/enums';
import { UserStatusHistory } from './user-status-history.entity';
import { UserAccess } from './users.service';

/** The user row as read under `SELECT ... FOR UPDATE`. */
export interface LockedUser {
  id: string;
  role: UserRole;
  status: UserStatus;
  phone: string;
}

/** Who changed the status and why (issue #24). */
export interface StatusAudit {
  actorType: StatusHistoryActor;
  /** Null only for a `system` actor (DB CHECK). */
  actorUserId: string | null;
  /** Already trimmed and validated (10-500 characters). */
  reason: string;
}

/** One `user_status_history` row as the admin API returns it. */
export interface StatusHistoryItem {
  id: string;
  fromStatus: UserStatus;
  toStatus: UserStatus;
  /** Internal; never shown to the user (owner WQ-23). */
  reason: string;
  actorType: StatusHistoryActor;
  /** The acting user (admin), or null for a system actor. */
  actor: { id: string; displayName: string | null } | null;
  createdAt: Date;
}

export interface StatusWrite {
  /** Status before the change (equal to the new one when nothing changed). */
  from: UserStatus;
  /** Access as written: the cache is filled from this, not from a re-read. */
  access: UserAccess;
  /**
   * Monotonic per user (microseconds of `clock_timestamp()` taken while the
   * row lock is held), so a late cache write of an older change can never
   * replace a newer one.
   */
  version: number;
  /** The history row, when `audit` was given and the status changed. */
  entry: StatusHistoryItem | null;
}

export interface StatusHistoryPage {
  items: StatusHistoryItem[];
  nextCursor: string | null;
}

export const STATUS_HISTORY_DEFAULT_LIMIT = 20;
export const STATUS_HISTORY_MAX_LIMIT = 50;

interface HistoryRow {
  id: string;
  fromStatus: UserStatus;
  toStatus: UserStatus;
  reason: string;
  actorType: StatusHistoryActor;
  actorUserId: string | null;
  actorDisplayName: string | null;
  createdAt: Date;
  sortKey: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SORT_KEY_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

/**
 * Account status writes and the status history (issue #24). Owns the
 * `users.status` update and the `user_status_history` table; callers go
 * through `UserAccessService`, which also refreshes the access cache and
 * emits `user.status_changed`.
 */
@Injectable()
export class UserStatusStore {
  constructor(
    @InjectRepository(UserStatusHistory)
    private readonly history: Repository<UserStatusHistory>,
  ) {}

  /**
   * In one transaction: locks the user row (`SELECT ... FOR UPDATE`, so
   * changes of one user are serialised), runs `check` on the locked row (it
   * may throw to abort), then, if the status differs, updates `users.status`
   * and, with `audit`, inserts the history row. Either both are written or
   * neither. Null if no such user.
   */
  async write(
    userId: string,
    to: UserStatus,
    opts: { audit?: StatusAudit; check?: (current: LockedUser) => void } = {},
  ): Promise<StatusWrite | null> {
    return this.history.manager.transaction(async (manager) => {
      const rows: LockedUser[] = await manager.query(
        `SELECT id, role::text AS role, status::text AS status, phone
           FROM "users" WHERE id = $1 FOR UPDATE`,
        [userId],
      );
      const current = rows[0];
      if (!current) {
        return null;
      }
      opts.check?.(current);

      let entry: StatusHistoryItem | null = null;
      if (current.status !== to) {
        await manager.query(`UPDATE "users" SET status = $2, "updatedAt" = now() WHERE id = $1`, [userId, to]);
        if (opts.audit) {
          const { actorType, actorUserId, reason } = opts.audit;
          const inserted: { id: string; createdAt: Date; actorDisplayName: string | null }[] = await manager.query(
            `INSERT INTO "user_status_history" ("userId", "fromStatus", "toStatus", "actorType", "actorUserId", "reason")
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, "createdAt",
               (SELECT a."displayName" FROM "users" a WHERE a.id = $5) AS "actorDisplayName"`,
            [userId, current.status, to, actorType, actorUserId, reason],
          );
          const row = inserted[0];
          entry = {
            id: row.id,
            fromStatus: current.status,
            toStatus: to,
            reason,
            actorType,
            actor: actorUserId ? { id: actorUserId, displayName: row.actorDisplayName ?? null } : null,
            createdAt: row.createdAt,
          };
        }
      }

      const clock: { v: string }[] = await manager.query(
        `SELECT (extract(epoch FROM clock_timestamp()) * 1000000)::bigint::text AS v`,
      );
      return {
        from: current.status,
        access: { status: to, role: current.role, phone: current.phone },
        version: Number(clock[0].v),
        entry,
      };
    });
  }

  /**
   * Status history of a user, newest first, cursor on (createdAt, id) with
   * microsecond precision. Null if no such user; 400 `cursor_invalid` for an
   * unreadable cursor or one from another user's history.
   */
  async list(userId: string, opts: { cursor?: string | null; limit?: number } = {}): Promise<StatusHistoryPage | null> {
    const limit = Math.min(Math.max(opts.limit ?? STATUS_HISTORY_DEFAULT_LIMIT, 1), STATUS_HISTORY_MAX_LIMIT);
    const after = decodeHistoryCursor(opts.cursor, userId);
    const exists: unknown[] = await this.history.manager.query(`SELECT 1 FROM "users" WHERE id = $1`, [userId]);
    if (exists.length === 0) {
      return null;
    }
    const rows: HistoryRow[] = await this.history.manager.query(
      `SELECT h.id, h."fromStatus"::text AS "fromStatus", h."toStatus"::text AS "toStatus", h.reason,
              h."actorType"::text AS "actorType", h."actorUserId", a."displayName" AS "actorDisplayName",
              h."createdAt",
              to_char(h."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "sortKey"
         FROM "user_status_history" h
         LEFT JOIN "users" a ON a.id = h."actorUserId"
        WHERE h."userId" = $1
          AND ($2::timestamptz IS NULL OR (h."createdAt", h.id) < ($2::timestamptz, $3::uuid))
        ORDER BY h."createdAt" DESC, h.id DESC
        LIMIT $4`,
      [userId, after?.at ?? null, after?.id ?? null, limit + 1],
    );
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map(toItem),
      nextCursor: rows.length > limit && last ? encodeHistoryCursor(userId, last.sortKey, last.id) : null,
    };
  }
}

const toItem = (row: HistoryRow): StatusHistoryItem => ({
  id: row.id,
  fromStatus: row.fromStatus,
  toStatus: row.toStatus,
  reason: row.reason,
  actorType: row.actorType,
  actor: row.actorUserId ? { id: row.actorUserId, displayName: row.actorDisplayName ?? null } : null,
  createdAt: row.createdAt,
});

export const encodeHistoryCursor = (userId: string, at: string, id: string): string =>
  Buffer.from(JSON.stringify({ u: userId, at, id }), 'utf-8').toString('base64url');

export const decodeHistoryCursor = (
  cursor: string | null | undefined,
  userId: string,
): { at: string; id: string } | null => {
  if (!cursor) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8')) as {
      u?: unknown;
      at?: unknown;
      id?: unknown;
    };
    if (
      parsed.u === userId &&
      typeof parsed.at === 'string' &&
      SORT_KEY_RE.test(parsed.at) &&
      !Number.isNaN(Date.parse(parsed.at)) &&
      typeof parsed.id === 'string' &&
      UUID_RE.test(parsed.id)
    ) {
      return { at: parsed.at, id: parsed.id };
    }
  } catch {
    // Falls through to the 400.
  }
  throw new ApiError(HttpStatus.BAD_REQUEST, 'cursor_invalid', 'Unknown cursor');
};
