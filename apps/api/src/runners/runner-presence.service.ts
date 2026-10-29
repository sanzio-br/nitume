import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RedisService } from '../infra/redis/redis.service';

/**
 * Issue #36 (owner Q14-5, Q14-6, Q14-7, 2026-10-29): which client a runner
 * last used (the website marks its socket `auth.client = 'web'`; anything
 * else is the app) and when their last location ping arrived. Redis only,
 * never stored in PostgreSQL (no schema change).
 */
export type PresenceClient = 'web' | 'app';

/** `handshake.auth.client`: exactly `'web'` is the website; anything else, or nothing, is the app. */
export const presenceClientOf = (auth: unknown): PresenceClient =>
  auth && typeof auth === 'object' && (auth as { client?: unknown }).client === 'web' ? 'web' : 'app';

/**
 * Redis hash `runner:presence:{runnerProfileId}` (TTL
 * `location.presenceTtlSeconds`, default 24 h, refreshed on every write).
 * Times are epoch milliseconds as strings. Fields: `client`, `lastPingAt`
 * (server receipt time of the last accepted ping), `webPingsStoppedAt`
 * (set once by the sweep), `connectedAt` (last socket connect) and
 * `onlineAt` (last switch to online).
 */
export const runnerPresenceKey = (runnerProfileId: string): string => `runner:presence:${runnerProfileId}`;

/** Admin read (`GET /runners`, `GET /runners/:id/verifications`), ISO times. */
export interface RunnerPresenceView {
  /** null when the runner has no presence record (no socket or ping within the TTL). */
  client: PresenceClient | null;
  lastPingAt: string | null;
  /** Set while ops is flagged (web runner, online or busy, no ping past the threshold); null otherwise. */
  webPingsStoppedAt: string | null;
}

/** What the sweep reads. Times in epoch ms. */
export interface PresenceRecord {
  client: PresenceClient | null;
  lastPingAt: number | null;
  webPingsStoppedAt: number | null;
  connectedAt: number | null;
  onlineAt: number | null;
}

export const EMPTY_PRESENCE: RunnerPresenceView = { client: null, lastPingAt: null, webPingsStoppedAt: null };

/**
 * In-process events (EventEmitter2); the realtime gateway relays them to the
 * `admins` room as `runner:web_pings_stopped`, `runner:web_pings_resumed`
 * and `runner:web_auto_offline`.
 */
export const WEB_PINGS_STOPPED_EVENT = 'runner.web_pings_stopped';
export const WEB_PINGS_RESUMED_EVENT = 'runner.web_pings_resumed';
export const WEB_AUTO_OFFLINE_EVENT = 'runner.web_auto_offline';

export interface WebPingsStoppedEvent {
  runnerProfileId: string;
  /** ISO; null when the web runner never pinged. */
  lastPingAt: string | null;
  at: string;
}

export interface WebPingsResumedEvent {
  runnerProfileId: string;
  at: string;
}

export interface WebAutoOfflineEvent {
  runnerProfileId: string;
  lastPingAt: string | null;
  at: string;
}

/**
 * The moment the "no ping" clock starts: the latest of the last ping, the
 * last socket connect and the last switch to online (so a runner who just
 * opened the tab or just went online is never flagged before their first
 * ping is due).
 */
export const silentSince = (r: PresenceRecord): number =>
  Math.max(r.lastPingAt ?? 0, r.connectedAt ?? 0, r.onlineAt ?? 0);

// Every script refreshes the TTL (ARGV last). HGET of a missing field is false in Lua.
const PING_SCRIPT = `
local prev = redis.call('HGET', KEYS[1], 'webPingsStoppedAt')
redis.call('HSET', KEYS[1], 'client', ARGV[1], 'lastPingAt', ARGV[2])
redis.call('HDEL', KEYS[1], 'webPingsStoppedAt')
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
return prev or ''
`;

const CONNECT_SCRIPT = `
local prev = false
if ARGV[1] ~= 'web' then
  prev = redis.call('HGET', KEYS[1], 'webPingsStoppedAt')
  redis.call('HDEL', KEYS[1], 'webPingsStoppedAt')
end
redis.call('HSET', KEYS[1], 'client', ARGV[1], 'connectedAt', ARGV[2])
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
return prev or ''
`;

const AVAILABILITY_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 0 then
  return 0
end
redis.call('HDEL', KEYS[1], 'webPingsStoppedAt')
if ARGV[1] == 'online' then
  redis.call('HSET', KEYS[1], 'onlineAt', ARGV[2])
end
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
return 1
`;

// Sets the flag only on a web record that is still silent since the cutoff
// and not already flagged; returns lastPingAt ('' when never pinged) or nil.
const STOPPED_SCRIPT = `
if redis.call('HGET', KEYS[1], 'client') ~= 'web' then
  return false
end
if redis.call('HEXISTS', KEYS[1], 'webPingsStoppedAt') == 1 then
  return false
end
local since = 0
for _, f in ipairs({'lastPingAt', 'connectedAt', 'onlineAt'}) do
  local v = tonumber(redis.call('HGET', KEYS[1], f) or '0') or 0
  if v > since then since = v end
end
if since > tonumber(ARGV[1]) then
  return false
end
redis.call('HSET', KEYS[1], 'webPingsStoppedAt', ARGV[2])
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
return redis.call('HGET', KEYS[1], 'lastPingAt') or ''
`;

const ms = (value: string | undefined): number | null => {
  if (value === undefined || value === '') {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const iso = (value: number | null): string | null => (value === null ? null : new Date(value).toISOString());

export const recordOf = (hash: Record<string, string>): PresenceRecord => ({
  client: hash.client === 'web' || hash.client === 'app' ? hash.client : null,
  lastPingAt: ms(hash.lastPingAt),
  webPingsStoppedAt: ms(hash.webPingsStoppedAt),
  connectedAt: ms(hash.connectedAt),
  onlineAt: ms(hash.onlineAt),
});

export const viewOf = (r: PresenceRecord): RunnerPresenceView => ({
  client: r.client,
  lastPingAt: iso(r.lastPingAt),
  webPingsStoppedAt: iso(r.webPingsStoppedAt),
});

/**
 * Issue #36: the runner presence record (Redis only). Writers never throw
 * (a Redis failure is logged and the ping, connect or availability change
 * goes on); the admin read falls back to an empty presence.
 */
@Injectable()
export class RunnerPresenceService {
  private readonly logger = new Logger(RunnerPresenceService.name);

  constructor(
    private readonly redis: RedisService,
    @Optional() private readonly config?: ConfigService,
    @Optional() private readonly events?: EventEmitter2,
  ) {}

  ttlSeconds(): number {
    const v = Number(this.config?.get<number>('location.presenceTtlSeconds', 86_400) ?? 86_400);
    return Number.isFinite(v) && v >= 60 ? Math.floor(v) : 86_400;
  }

  /** An accepted `location:ping` (idle or job). Clears the flag; emits `resumed` when it was set. */
  async recordPing(runnerProfileId: string, client: PresenceClient, now: Date = new Date()): Promise<void> {
    await this.write('ping', runnerProfileId, now, PING_SCRIPT, [client, String(now.getTime()), this.ttlSeconds()]);
  }

  /**
   * A runner socket connected. A web socket starts the "no ping" clock for a
   * web runner who never pings; an app socket marks the runner as an app
   * runner and clears any web flag (emits `resumed`).
   */
  async recordConnect(runnerProfileId: string, client: PresenceClient, now: Date = new Date()): Promise<void> {
    await this.write('connect', runnerProfileId, now, CONNECT_SCRIPT, [client, String(now.getTime()), this.ttlSeconds()]);
  }

  /**
   * The runner's availability changed (any path). Going online restarts the
   * clock; going offline clears the flag silently (no event). Only an
   * existing record is touched.
   */
  async recordAvailability(runnerProfileId: string, availability: 'online' | 'offline', now: Date = new Date()): Promise<void> {
    try {
      await this.redis.evalScript(AVAILABILITY_SCRIPT, [runnerPresenceKey(runnerProfileId)], [
        availability,
        String(now.getTime()),
        this.ttlSeconds(),
      ]);
    } catch (err) {
      this.logger.warn(`Presence of ${runnerProfileId} not updated (${availability}): ${message(err)}`);
    }
  }

  /**
   * Sets `webPingsStoppedAt` when the record is a web one, not yet flagged
   * and silent since `cutoff` (atomic, so a ping in between wins). Emits
   * `runner.web_pings_stopped` once and returns true when it set the flag.
   * Throws on a Redis failure (the sweep logs it and goes on).
   */
  async markStopped(runnerProfileId: string, cutoff: Date, now: Date = new Date()): Promise<boolean> {
    const out = await this.redis.evalScript(STOPPED_SCRIPT, [runnerPresenceKey(runnerProfileId)], [
      String(cutoff.getTime()),
      String(now.getTime()),
      this.ttlSeconds(),
    ]);
    if (typeof out !== 'string') {
      return false;
    }
    this.events?.emit(WEB_PINGS_STOPPED_EVENT, {
      runnerProfileId,
      lastPingAt: iso(ms(out)),
      at: now.toISOString(),
    } satisfies WebPingsStoppedEvent);
    return true;
  }

  /** Raw records for the sweep, in `ids` order (null when none). Throws on a Redis failure. */
  async recordsOf(ids: string[]): Promise<(PresenceRecord | null)[]> {
    const hashes = await this.redis.hgetallMany(ids.map(runnerPresenceKey));
    return hashes.map((h) => (Object.keys(h).length === 0 ? null : recordOf(h)));
  }

  /** One record (null when none). Throws on a Redis failure. */
  async recordOf(runnerProfileId: string): Promise<PresenceRecord | null> {
    return (await this.recordsOf([runnerProfileId]))[0] ?? null;
  }

  /** Admin views by runner profile id; empty presence for unknown ids or when Redis fails. */
  async viewsOf(ids: string[]): Promise<Map<string, RunnerPresenceView>> {
    const out = new Map<string, RunnerPresenceView>();
    if (ids.length === 0) {
      return out;
    }
    try {
      const records = await this.recordsOf(ids);
      ids.forEach((id, i) => {
        const r = records[i];
        out.set(id, r ? viewOf(r) : EMPTY_PRESENCE);
      });
    } catch (err) {
      this.logger.warn(`Presence not read for ${ids.length} runners: ${message(err)}`);
    }
    return out;
  }

  private async write(
    what: string,
    runnerProfileId: string,
    now: Date,
    script: string,
    args: (string | number)[],
  ): Promise<void> {
    let prev: unknown;
    try {
      prev = await this.redis.evalScript(script, [runnerPresenceKey(runnerProfileId)], args);
    } catch (err) {
      this.logger.warn(`Presence of ${runnerProfileId} not updated (${what}): ${message(err)}`);
      return;
    }
    if (typeof prev === 'string' && prev !== '') {
      this.events?.emit(WEB_PINGS_RESUMED_EVENT, {
        runnerProfileId,
        at: now.toISOString(),
      } satisfies WebPingsResumedEvent);
    }
  }
}

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));
