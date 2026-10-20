import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import type { Queue } from 'bullmq';
import { AuthContext } from '../common/decorators/auth.decorators';
import {
  AssignmentStatus,
  ErrandCategory,
  ErrandPointType,
  ErrandStatus,
  RunnerAvailability,
  UserRole,
} from '../common/enums';
import { ErrandsService } from '../errands/errands.service';
import { LOCATION_CHANNEL_PATTERN, locationChannel } from '../infra/redis/channels';
import { RedisService } from '../infra/redis/redis.service';
import { GEOFENCE_ARRIVAL_JOB, LOCATION_PERSIST_JOB, LOCATION_QUEUE } from '../infra/queue/queues';
import { RunnersService } from '../runners/runners.service';

/**
 * Job states in which the accepted runner's pings are live (row 27, row 123,
 * `_shared.md` §10): from accept to AWAITING_CUSTOMER, exclusive.
 */
export const PING_STATES: ReadonlySet<ErrandStatus> = new Set([
  ErrandStatus.RUNNER_EN_ROUTE,
  ErrandStatus.ARRIVED,
  ErrandStatus.IN_PROGRESS,
]);

/**
 * Per-runner live position (JSON, TTL `location.liveTtlSeconds`, §4.2
 * "ephemeral, TTL 60 s"). The §4.2 GEO set (`runner:locations`) is not
 * written: nothing reads it yet and its members have no TTL, so it would
 * keep every runner's last position (reviewer B1, row 247). It returns
 * with pruning once matching reads it.
 */
export const runnerLiveKey = (runnerProfileId: string): string => `runner:location:${runnerProfileId}`;

/** What subscribers of `locationChannel(errandId)` receive. */
export interface LocationMessage {
  errandId: string;
  runnerProfileId: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  ts: string;
}

/** Row 247: only job pings are ever queued for PostgreSQL, so `errandId` is always set. */
export interface LocationPersistJob {
  runnerProfileId: string;
  errandId: string;
  lat: number;
  lng: number;
  capturedAt: string;
  trail: boolean;
}

export interface GeofenceArrivalJob {
  errandId: string;
  runnerProfileId: string;
  lat: number;
  lng: number;
}

export interface LocationPingResult {
  ok: boolean;
  error?:
    | 'not_runner'
    | 'invalid_payload'
    | 'rate_limited'
    | 'stale_ping'
    | 'runner_offline'
    | 'forbidden'
    | 'not_live'
    | 'unavailable';
  status?: ErrandStatus;
}

interface ParsedPing {
  lat: number;
  lng: number;
  errandId: string | null;
  accuracy: number | null;
  capturedAt: Date;
}

interface RunnerEntry {
  runnerProfileId: string;
  availability: RunnerAvailability;
  until: number;
}

interface JobEntry {
  status: ErrandStatus;
  /** Runner profile on the accepted assignment, null when none is accepted. */
  acceptedRunnerProfileId: string | null;
  arrivalPointId: string | null;
  arrivalQueued: boolean;
  until: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RUNNER_CACHE_MS = 5_000;
const JOB_CACHE_MS = 10_000;
/** A device clock may run slightly ahead of the server. */
const MAX_FUTURE_SKEW_MS = 30_000;
const MAX_ACCURACY_M = 100_000;

/** Categories whose runner goes to a pickup first (`v-active` R-16: Buy For Me, Get It For Me). */
const PICKUP_FIRST: ReadonlySet<ErrandCategory> = new Set([ErrandCategory.BUY_FOR_ME, ErrandCategory.PICKUP_DELIVERY]);

/**
 * §4.3 arrival point, the same one `v-active` navigates to before
 * IN_PROGRESS: the pickup on Buy For Me / Get It For Me when there is one,
 * else the task site, else the pickup, else the drop-off.
 */
export const arrivalPointOf = <T extends { id: string; pointType: ErrandPointType }>(
  category: ErrandCategory,
  points: readonly T[],
): T | null => {
  const of = (t: ErrandPointType) => points.find((p) => p.pointType === t) ?? null;
  if (PICKUP_FIRST.has(category) && of(ErrandPointType.PICKUP)) {
    return of(ErrandPointType.PICKUP);
  }
  return of(ErrandPointType.TASK_SITE) ?? of(ErrandPointType.PICKUP) ?? of(ErrandPointType.DROPOFF);
};

/** Validates a `location:ping` body; null when malformed. */
export const parsePing = (body: unknown, now: Date): ParsedPing | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }
  const b = body as Record<string, unknown>;
  const lat = b.lat;
  const lng = b.lng;
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }
  let errandId: string | null = null;
  if (b.errandId !== undefined && b.errandId !== null) {
    if (typeof b.errandId !== 'string' || !UUID.test(b.errandId)) {
      return null;
    }
    errandId = b.errandId.toLowerCase();
  }
  let accuracy: number | null = null;
  if (b.accuracy !== undefined && b.accuracy !== null) {
    if (typeof b.accuracy !== 'number' || !Number.isFinite(b.accuracy) || b.accuracy < 0 || b.accuracy > MAX_ACCURACY_M) {
      return null;
    }
    accuracy = b.accuracy;
  }
  let capturedAt = now;
  if (b.ts !== undefined && b.ts !== null) {
    if (typeof b.ts !== 'string' || b.ts.length > 40) {
      return null;
    }
    const at = new Date(b.ts);
    if (Number.isNaN(at.getTime()) || at.getTime() > now.getTime() + MAX_FUTURE_SKEW_MS) {
      return null;
    }
    // Never later than the server clock, so the stored order stays true.
    capturedAt = at.getTime() > now.getTime() ? now : at;
  }
  return { lat, lng, errandId, accuracy, capturedAt };
};

/**
 * RA-4: runner `location:ping` intake (§4.2, §4.3). Synchronous work is
 * Redis only (throttle, live key, PUBLISH for the fan-out); every
 * PostgreSQL write goes through the `location` queue (§9). Pings are
 * accepted only from an online or busy runner (row 123: none offline) and,
 * with an `errandId`, only from the runner holding that job's accepted
 * assignment while it is RUNNER_EN_ROUTE, ARRIVED or IN_PROGRESS (rows 27,
 * 65, 183). Row 247 (owner, 2026-10-20): only those job pings are stored
 * (`location.persistEnabled`, sampled trail linked to the task, deleted
 * `location.retentionDays` after the task ends); errand-less pings (online,
 * no job) are Redis live presence only, never stored and never fanned out.
 */
@Injectable()
export class LocationIngestService {
  private readonly logger = new Logger(LocationIngestService.name);
  private readonly runnersByUser = new Map<string, RunnerEntry>();
  private readonly jobs = new Map<string, JobEntry>();

  constructor(
    private readonly errands: ErrandsService,
    private readonly runners: RunnersService,
    private readonly redis: RedisService,
    @InjectQueue(LOCATION_QUEUE) private readonly queue: Queue,
    @Optional() private readonly config?: ConfigService,
  ) {}

  private cfg(key: string, fallback: number): number {
    return this.config?.get<number>(`location.${key}`, fallback) ?? fallback;
  }

  /** The PSUBSCRIBE pattern for the fan-out, with the key prefix (row 224). */
  channelPattern(): string {
    return this.redis.channel(LOCATION_CHANNEL_PATTERN);
  }

  async ingest(user: AuthContext | undefined, body: unknown, now: Date = new Date()): Promise<LocationPingResult> {
    if (!user || user.role !== UserRole.RUNNER) {
      return { ok: false, error: 'not_runner' };
    }
    const ping = parsePing(body, now);
    if (ping === null) {
      return { ok: false, error: 'invalid_payload' };
    }
    if (now.getTime() - ping.capturedAt.getTime() > this.cfg('pingMaxAgeSeconds', 60) * 1000) {
      return { ok: false, error: 'stale_ping' };
    }
    try {
      const throttled = !(await this.redis.setIfAbsentMs(
        `location:throttle:${user.userId}`,
        '1',
        this.cfg('pingMinIntervalMs', 2000),
      ));
      if (throttled) {
        return { ok: false, error: 'rate_limited' };
      }
      const runner = await this.runnerFor(user.userId, now);
      if (!runner) {
        return { ok: false, error: 'not_runner' };
      }
      if (runner.availability === RunnerAvailability.OFFLINE) {
        return { ok: false, error: 'runner_offline' };
      }
      let job: JobEntry | null = null;
      if (ping.errandId) {
        job = await this.jobFor(ping.errandId, now);
        if (!job || job.acceptedRunnerProfileId !== runner.runnerProfileId) {
          return { ok: false, error: 'forbidden' };
        }
        if (!PING_STATES.has(job.status)) {
          return { ok: false, error: 'not_live', status: job.status };
        }
      }
      await this.storeLive(runner.runnerProfileId, ping);
      if (ping.errandId && job) {
        const message: LocationMessage = {
          errandId: ping.errandId,
          runnerProfileId: runner.runnerProfileId,
          lat: ping.lat,
          lng: ping.lng,
          accuracy: ping.accuracy,
          ts: ping.capturedAt.toISOString(),
        };
        await this.redis.publish(this.redis.channel(locationChannel(ping.errandId)), JSON.stringify(message));
      }
      // Row 247: job pings only; idle positions stay Redis presence.
      if (ping.errandId && job && this.config?.get<boolean>('location.persistEnabled', true)) {
        await this.enqueuePersist(runner.runnerProfileId, ping.errandId, ping);
      }
      if (ping.errandId && job?.status === ErrandStatus.RUNNER_EN_ROUTE) {
        await this.checkGeofence(ping.errandId, runner.runnerProfileId, job, ping);
      }
      return job ? { ok: true, status: job.status } : { ok: true };
    } catch (err) {
      this.logger.warn(`location:ping from ${user.userId} not processed: ${err instanceof Error ? err.message : String(err)}`);
      return { ok: false, error: 'unavailable' };
    }
  }

  /**
   * The runner's live position from Redis (§4.2), or null when the runner
   * has not pinged within `liveTtlSeconds`. Never throws.
   */
  async liveFor(runnerProfileId: string): Promise<{ lat: number; lng: number; capturedAt: Date } | null> {
    try {
      const raw = await this.redis.get(runnerLiveKey(runnerProfileId));
      if (!raw) {
        return null;
      }
      const v = JSON.parse(raw) as { lat?: unknown; lng?: unknown; ts?: unknown };
      if (typeof v.lat !== 'number' || typeof v.lng !== 'number' || typeof v.ts !== 'string') {
        return null;
      }
      return { lat: v.lat, lng: v.lng, capturedAt: new Date(v.ts) };
    } catch {
      return null;
    }
  }

  /** A status change makes the next ping re-read the job. */
  @OnEvent('errand.status_changed')
  onStatusChanged(event: { errandId?: string }): void {
    this.forgetJob(event?.errandId);
  }

  /** So does an access change (reassignment, offer closed). */
  @OnEvent('errand.access_changed')
  onAccessChanged(event: { errandId?: string }): void {
    this.forgetJob(event?.errandId);
  }

  forgetJob(errandId: string | undefined): void {
    if (errandId) {
      this.jobs.delete(errandId);
    }
  }

  private async runnerFor(userId: string, now: Date): Promise<RunnerEntry | null> {
    const hit = this.runnersByUser.get(userId);
    if (hit && hit.until > now.getTime()) {
      return hit;
    }
    let profile: { id: string; availability: RunnerAvailability };
    try {
      profile = await this.runners.profileByUserId(userId);
    } catch {
      return null;
    }
    const entry: RunnerEntry = {
      runnerProfileId: profile.id,
      availability: profile.availability,
      until: now.getTime() + RUNNER_CACHE_MS,
    };
    this.runnersByUser.set(userId, entry);
    return entry;
  }

  private async jobFor(errandId: string, now: Date): Promise<JobEntry | null> {
    const hit = this.jobs.get(errandId);
    if (hit && hit.until > now.getTime()) {
      return hit;
    }
    const [errand] = await this.errands.findByIds([errandId]);
    if (!errand) {
      return null;
    }
    const assignment = await this.errands.activeAssignmentFor(errandId);
    const points = errand.status === ErrandStatus.RUNNER_EN_ROUTE ? await this.errands.locationsFor(errandId) : [];
    const entry: JobEntry = {
      status: errand.status,
      acceptedRunnerProfileId:
        assignment?.status === AssignmentStatus.ACCEPTED ? assignment.runnerProfileId : null,
      arrivalPointId: arrivalPointOf(errand.category, points)?.id ?? null,
      arrivalQueued: false,
      until: now.getTime() + JOB_CACHE_MS,
    };
    this.jobs.set(errandId, entry);
    return entry;
  }

  private async storeLive(runnerProfileId: string, ping: ParsedPing): Promise<void> {
    await this.redis.set(
      runnerLiveKey(runnerProfileId),
      JSON.stringify({
        lat: ping.lat,
        lng: ping.lng,
        accuracy: ping.accuracy,
        errandId: ping.errandId,
        ts: ping.capturedAt.toISOString(),
      }),
      this.cfg('liveTtlSeconds', 60),
    );
  }

  /**
   * A job ping (row 247): moves `lastPingAt`; the first and every Nth also
   * join the trail (§4.2), linked to the task.
   */
  private async enqueuePersist(runnerProfileId: string, errandId: string, ping: ParsedPing): Promise<void> {
    const n = await this.redis.incrementWithTtl(`location:count:${runnerProfileId}`, 3600);
    const every = this.cfg('trailEveryN', 10);
    const data: LocationPersistJob = {
      runnerProfileId,
      errandId,
      lat: ping.lat,
      lng: ping.lng,
      capturedAt: ping.capturedAt.toISOString(),
      trail: n % every === 1 || every === 1,
    };
    // Positions are ephemeral: one attempt, never kept once done.
    await this.queue.add(LOCATION_PERSIST_JOB, data, { attempts: 1, removeOnComplete: true, removeOnFail: 100 });
  }

  /**
   * §4.3: inside the radius of the arrival point while RUNNER_EN_ROUTE ->
   * queue the system ARRIVED transition once. A fix less precise than the
   * radius never auto-arrives (the runner's manual `I've arrived` stays).
   */
  private async checkGeofence(errandId: string, runnerProfileId: string, job: JobEntry, ping: ParsedPing): Promise<void> {
    const radius = this.cfg('geofenceRadiusMeters', 100);
    if (job.arrivalQueued || !job.arrivalPointId || (ping.accuracy !== null && ping.accuracy > radius)) {
      return;
    }
    if (!(await this.errands.isWithinPoint(job.arrivalPointId, ping.lat, ping.lng, radius))) {
      return;
    }
    job.arrivalQueued = true;
    const data: GeofenceArrivalJob = { errandId, runnerProfileId, lat: ping.lat, lng: ping.lng };
    await this.queue.add(GEOFENCE_ARRIVAL_JOB, data, {
      jobId: `geofence-arrival-${errandId}`,
      attempts: 3,
      removeOnComplete: true,
      removeOnFail: 100,
    });
  }
}
