import { HttpStatus, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ApiError, conflict } from '../common/api-error';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import {
  GeoPoint,
  RunnerAvailability,
  RunnerSkill,
  RunnerVerificationType,
  VerificationLevel,
  VerificationStatus,
} from '../common/enums';
import { RunnerLocation } from './runner-location.entity';
import { RunnerProfile } from './runner-profile.entity';
import { RunnerServiceArea, RunnerSkillEntity } from './runner-skill.entity';
import { RunnerVerification, RunnerVerificationSide } from './runner-verification.entity';
import { documentTooLarge, idMaxUploadBytes, matchesImageSignature } from './upload/verification-upload';
import { VerificationDocumentAccessLog, VerificationDocumentAction } from './verification-document-access-log.entity';
import {
  ConsoleVerificationDocumentStorage,
  MAX_DOCUMENT_URL_TTL_SECONDS,
  VERIFICATION_DOCUMENT_STORAGE,
  VerificationDocumentStorage,
} from './verification-storage/verification-document-storage';
import { UsersService } from '../users/users.service';
import { shortNameOf } from './short-name';
import { ServiceArea, ServiceAreaOption, areasContaining, listedAreaIds, serviceAreaOptionsOf } from './service-areas';
import {
  ID_VERIFIED_TYPES,
  Level2Check,
  VerificationSummary,
  level2MissingOf,
  meetsIdVerifiedRule,
  verificationSummaryOf,
} from './verification-summary';

/**
 * Rows 263, 266 (owner, 2026-10-21): a runner dropped from `2_id_verified`
 * to `1_basic`. Emitted after the change has committed (awaited, listeners
 * never throw); the errands module withdraws the runner's open offers.
 */
export const RUNNER_LEVEL_DROPPED_EVENT = 'runner.level_dropped';

export interface RunnerLevelDroppedEvent {
  runnerProfileId: string;
  from: VerificationLevel;
  to: VerificationLevel;
  /** `upload` | `decision`. */
  cause: 'upload' | 'decision';
  at: string;
}

/** Skills a runner may choose in the MVP (OA-18: Business Tasks not offered). */
export const OFFERED_SKILLS: readonly RunnerSkill[] = [
  RunnerSkill.BUY_FOR_ME,
  RunnerSkill.PICKUP_DELIVERY,
  RunnerSkill.INSPECTION,
  RunnerSkill.REPRESENTATION,
  RunnerSkill.QUEUE_ADMIN,
];

const SKILL_ORDER: readonly RunnerSkill[] = Object.values(RunnerSkill);
const bySkillOrder = (a: RunnerSkill, b: RunnerSkill): number => SKILL_ORDER.indexOf(a) - SKILL_ORDER.indexOf(b);

/**
 * `GET /runners/me` (RA-18): the runner's own view. No trust score, no
 * stored location, no internal rates.
 */
export interface RunnerSelfView {
  id: string;
  userId: string;
  displayName: string | null;
  /** First name + last initial (row 40); null until a name is set. */
  shortName: string | null;
  verificationLevel: VerificationLevel;
  /** online | offline | busy (busy is server-set while a job is active, RA-20). */
  availability: RunnerAvailability;
  avgRating: string;
  errandsCompleted: number;
  completionRate: string;
  /** Read-only for the runner (row 138), KES decimal string. */
  maxPurchaseAdvance: string;
  lastPingAt: Date | null;
  /** Category values (row 115), in category order. */
  skills: RunnerSkill[];
  /** Listed areas only (row 116), by name. */
  serviceAreas: ServiceAreaOption[];
  verification: VerificationSummary;
}

/**
 * Lightweight public runner card embedded on errand responses (no PII: no
 * phone, no location, no verification documents).
 */
export interface RunnerPublicSummary {
  id: string;
  /** Runner's chosen display name; null until set. */
  displayName: string | null;
  /** First name + last initial ("Kevin O."), computed by the API; null until a name is set. */
  shortName: string | null;
  verificationLevel: VerificationLevel;
  avgRating: string;
  errandsCompleted: number;
}

export interface PublicRunnerProfile {
  id: string;
  displayName: string | null;
  /** First name + last initial ("Kevin O."); null until a name is set. */
  shortName: string | null;
  verificationLevel: VerificationLevel;
  avgRating: string;
  errandsCompleted: number;
  availability: RunnerAvailability;
  skills: RunnerSkill[];
  /** Names of the runner's listed service areas (row 116). */
  serviceAreas: string[];
}

/**
 * A verification as clients see it: the storage key is never returned (rows
 * 125, 154); `hasDocument` says whether an image is still stored.
 */
export type VerificationView = Omit<RunnerVerification, 'documentS3Key'> & { hasDocument: boolean };

/** Admin queue item (row 154: no storage key). */
/** One audited "Re-review evidence" (row 171). `note` is null after the purge (row 170). */
export interface ReReviewView {
  id: string;
  /**
   * Never null: CHK_verification_document_access_log_actor requires an actor
   * on every row except the system purge, so a re_review always has its admin.
   */
  reviewedBy: { id: string; displayName: string | null };
  createdAt: Date;
  note: string | null;
}

/** Who the runner is, on admin verification items (rows 260, 261). */
export interface AdminRunnerRef {
  id: string;
  userId: string;
  verificationLevel: VerificationLevel;
  /** The runner's listed service areas by name (row 116); unlisted ids are left out. */
  serviceAreas: ServiceAreaOption[];
  /** When the runner applied: the runner profile's `createdAt`. */
  appliedAt: Date;
  /** N-L1: Level 2 checks not met (`level2MissingOf`), ID front, ID back, selfie order; [] when met. */
  level2Missing: Level2Check[];
}

export interface AdminRunnerUser {
  id: string;
  phone: string | null;
  /** The user's display name; null until set (row 260). */
  displayName: string | null;
  /** First name + last initial ("Mary W.", row 40); null until a name is set. */
  shortName: string | null;
}

export type AdminVerificationView = VerificationView & {
  runnerProfile: AdminRunnerRef | null;
  user: AdminRunnerUser | null;
  /** The admin who decided, with a display name (round-10 spec). */
  reviewer: { id: string; displayName: string | null } | null;
  /** Re-reviews of the evidence, oldest first (row 171). */
  reReviews: ReReviewView[];
};

/** `status` of the runner-grouped queue: a verification status, or `all`. */
export type VerificationQueueStatus = VerificationStatus | 'all';

/**
 * One runner in the admin verification queue (row 260): the runner (level,
 * areas, `appliedAt`), the user (phone, displayName, shortName), every
 * record they have (history included, newest first, admin item shape), how
 * many checks are pending on their newest record and since when (A-9), and
 * the required-check summary (newest
 * record of each check, `missing` when never submitted).
 */
export interface AdminVerificationQueueItem {
  runnerProfile: AdminRunnerRef;
  user: AdminRunnerUser | null;
  checks: AdminVerificationView[];
  pendingCount: number;
  oldestPendingAt: Date | null;
  verification: VerificationSummary;
}

/** Rows 171, 180 (decided): optional re-review note, at most 500 characters after trim, no minimum. */
export const RE_REVIEW_NOTE_MAX = 500;

export const toVerificationView = (v: RunnerVerification): VerificationView => {
  const { documentS3Key, ...rest } = v;
  return { ...rest, purgedAt: v.purgedAt ?? null, hasDocument: !!documentS3Key };
};

/**
 * What the runner sees of their own verification (row 262, A-8): the
 * reviewer's note and the reviewer's identity are internal to ops and never
 * sent on a runner-facing endpoint.
 */
export type RunnerVerificationView = Omit<VerificationView, 'reviewerNote' | 'reviewedBy'>;

export const toRunnerVerificationView = (v: RunnerVerification): RunnerVerificationView => {
  const view: Partial<VerificationView> = toVerificationView(v);
  delete view.reviewerNote;
  delete view.reviewedBy;
  return view as RunnerVerificationView;
};

/**
 * Row 195: `front` | `back` (any case) is required for a government_id image
 * and refused for a selfie. 400 verification_document_side_invalid (`allowed`).
 */
export const documentSideOf = (
  verificationType: RunnerVerificationType,
  input: string | null | undefined,
): RunnerVerificationSide | null => {
  const value = typeof input === 'string' ? input.trim().toLowerCase() : '';
  const allowed = Object.values(RunnerVerificationSide);
  if (verificationType === RunnerVerificationType.GOVERNMENT_ID) {
    if ((allowed as string[]).includes(value)) {
      return value as RunnerVerificationSide;
    }
    throw new ApiError(HttpStatus.BAD_REQUEST, 'verification_document_side_invalid', 'Say which side of the ID this is: front or back', {
      allowed,
    });
  }
  if (value) {
    throw new ApiError(HttpStatus.BAD_REQUEST, 'verification_document_side_invalid', 'A side is only sent with an ID image', {
      allowed: [],
    });
  }
  return null;
};

/** Verification types whose image goes to restricted storage (RA-7). */
export const DOCUMENT_VERIFICATION_TYPES: readonly RunnerVerificationType[] = [
  RunnerVerificationType.GOVERNMENT_ID,
  RunnerVerificationType.SELFIE,
];

export const DOCUMENT_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

export interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

/** A runner in a task's pool by identity (see `RunnersService.poolFor`). */
export interface PoolRunner {
  profile: RunnerProfile;
  displayName: string | null;
}

@Injectable()
export class RunnersService {
  private readonly logger = new Logger(RunnersService.name);

  constructor(
    @InjectRepository(RunnerProfile)
    private readonly profiles: Repository<RunnerProfile>,
    @InjectRepository(RunnerVerification)
    private readonly verifications: Repository<RunnerVerification>,
    @InjectRepository(RunnerSkillEntity)
    private readonly skills: Repository<RunnerSkillEntity>,
    @InjectRepository(RunnerServiceArea)
    private readonly serviceAreas: Repository<RunnerServiceArea>,
    private readonly users: UsersService,
    @Optional()
    @Inject(VERIFICATION_DOCUMENT_STORAGE)
    private readonly documents: VerificationDocumentStorage = new ConsoleVerificationDocumentStorage(),
    @Optional() private readonly config?: ConfigService,
    @Optional() private readonly events?: EventEmitter2,
  ) {}

  async createForUser(
    userId: string,
    maxPurchaseAdvanceDefault = 3000,
  ): Promise<RunnerProfile> {
    const existing = await this.profiles.findOne({ where: { userId } });
    if (existing) {
      return existing;
    }
    return this.profiles.save(
      this.profiles.create({
        userId,
        verificationLevel: VerificationLevel.ONE_BASIC,
        maxPurchaseAdvance: String(maxPurchaseAdvanceDefault),
      }),
    );
  }

  async profileByUserId(userId: string): Promise<RunnerProfile> {
    const profile = await this.profiles.findOne({ where: { userId } });
    if (!profile) {
      throw new NotFoundException('Runner profile not found');
    }
    return profile;
  }

  /** With `manager`, read inside the caller's transaction. */
  async profileById(id: string, manager?: EntityManager): Promise<RunnerProfile> {
    const repo = manager ? manager.getRepository(RunnerProfile) : this.profiles;
    const profile = await repo.findOne({ where: { id } });
    if (!profile) {
      throw new NotFoundException('Runner profile not found');
    }
    return profile;
  }

  async publicProfile(id: string): Promise<PublicRunnerProfile> {
    const profile = await this.profileById(id);
    const [skills, serviceAreas, names] = await Promise.all([
      this.skills.find({ where: { runnerProfileId: profile.id } }),
      this.serviceAreas.find({ where: { runnerProfileId: profile.id } }),
      this.users.displayNames([profile.userId]),
    ]);
    return {
      id: profile.id,
      displayName: names.get(profile.userId) ?? null,
      shortName: shortNameOf(names.get(profile.userId)),
      verificationLevel: profile.verificationLevel,
      avgRating: profile.avgRating,
      errandsCompleted: profile.errandsCompleted,
      availability: profile.availability,
      skills: skills.map((s) => s.skill),
      serviceAreas: this.listedAreas(serviceAreas.map((a) => a.area)).map((a) => a.name),
    };
  }

  /** Batch lookup of public runner summaries keyed by runner profile id. */
  async publicSummaries(ids: string[]): Promise<Map<string, RunnerPublicSummary>> {
    const unique = [...new Set(ids)].filter(Boolean);
    if (unique.length === 0) {
      return new Map();
    }
    const rows = await this.profiles.find({ where: { id: In(unique) } });
    const names = await this.users.displayNames(rows.map((p) => p.userId));
    return new Map(
      rows.map((p) => [
        p.id,
        {
          id: p.id,
          displayName: names.get(p.userId) ?? null,
          shortName: shortNameOf(names.get(p.userId)),
          verificationLevel: p.verificationLevel,
          avgRating: p.avgRating,
          errandsCompleted: p.errandsCompleted,
        },
      ]),
    );
  }

  /**
   * Row 247: the runner's newest stored location sample on one task (the
   * tracking fallback once the Redis live position has expired), or null.
   * Positions are only ever stored for a job, never on the profile.
   */
  async lastJobLocation(
    runnerProfileId: string,
    errandId: string,
  ): Promise<{ lat: number; lng: number; capturedAt: Date | null } | null> {
    const row = await this.profiles.manager.getRepository(RunnerLocation).findOne({
      where: { runnerProfileId, errandId },
      order: { capturedAt: 'DESC' },
    });
    if (!row) {
      return null;
    }
    const [lng, lat] = row.coordinates.coordinates;
    return { lat, lng, capturedAt: row.capturedAt };
  }

  /**
   * RA-4, §2.2, §4.2, row 247: stores one job ping (location queue worker
   * only). `lastPingAt` on `runner_profiles` moves forward only (an older
   * ping processed late never overwrites a newer one); no position is kept
   * on the profile (row 247: positions are stored only as job samples,
   * which the retention purge deletes). With `trail` the ping is kept in
   * `runner_locations`, linked to the task. Returns whether `lastPingAt`
   * moved.
   */
  async recordPing(ping: {
    runnerProfileId: string;
    errandId: string;
    lat: number;
    lng: number;
    capturedAt: Date;
    trail: boolean;
  }): Promise<boolean> {
    const result = await this.profiles
      .createQueryBuilder()
      .update(RunnerProfile)
      .set({ lastPingAt: ping.capturedAt })
      .where('id = :id', { id: ping.runnerProfileId })
      .andWhere('("lastPingAt" IS NULL OR "lastPingAt" < :at)', { at: ping.capturedAt })
      .execute();
    // Row 247: only job pings are ever stored, always with their task.
    if (ping.trail && ping.errandId) {
      const point: GeoPoint = { type: 'Point', coordinates: [ping.lng, ping.lat] };
      await this.profiles.manager.getRepository(RunnerLocation).insert({
        runnerProfileId: ping.runnerProfileId,
        errandId: ping.errandId,
        coordinates: point,
        capturedAt: ping.capturedAt,
      });
    }
    return (result.affected ?? 0) > 0;
  }

  /**
   * Row 247 retention: one page of the tasks that have stored location
   * samples, by task id after `afterErrandId` (keyset). The purge asks the
   * errands and disputes modules which of them may go.
   */
  async errandsWithLocationSamples(afterErrandId: string | null, batch = 500): Promise<string[]> {
    const qb = this.profiles.manager
      .getRepository(RunnerLocation)
      .createQueryBuilder('l')
      .select('DISTINCT l."errandId"', 'errandId')
      .where('l."errandId" IS NOT NULL')
      .orderBy('l."errandId"', 'ASC')
      .limit(batch);
    if (afterErrandId) {
      qb.andWhere('l."errandId" > :after', { after: afterErrandId });
    }
    const rows = await qb.getRawMany<{ errandId: string }>();
    return rows.map((r) => r.errandId);
  }

  /** Row 247 retention: deletes every location sample of the given tasks; returns how many. */
  async deleteLocationSamples(errandIds: string[]): Promise<number> {
    if (errandIds.length === 0) {
      return 0;
    }
    const result = await this.profiles.manager.getRepository(RunnerLocation).delete({ errandId: In(errandIds) });
    return result.affected ?? 0;
  }

  /**
   * RA-8, RA-20. The runner sets `online` or `offline`; `busy` is set by the
   * server while the runner holds an active job (400
   * availability_server_managed when sent). While busy: `offline` is refused
   * (409 runner_on_active_job), `online` changes nothing. Going online needs
   * every required check approved (403 runner_not_verified, `verification`).
   * Serialised with job start/end on the profile row lock.
   */
  async setAvailability(userId: string, availability: RunnerAvailability): Promise<RunnerSelfView> {
    if (availability === RunnerAvailability.BUSY) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'availability_server_managed',
        'Busy is set automatically while you are on a job',
        { allowed: [RunnerAvailability.ONLINE, RunnerAvailability.OFFLINE] },
      );
    }
    const id = (await this.profileByUserId(userId)).id;
    await this.profiles.manager.transaction(async (manager) => {
      const profile = await this.lockProfile(manager, id);
      if (profile.availability === RunnerAvailability.BUSY) {
        if (availability === RunnerAvailability.OFFLINE) {
          throw new ApiError(
            HttpStatus.CONFLICT,
            'runner_on_active_job',
            'Finish your active job before going offline',
          );
        }
        return;
      }
      if (availability === RunnerAvailability.ONLINE) {
        await this.assertVerified(profile.id, manager);
      }
      if (profile.availability !== availability) {
        await manager.getRepository(RunnerProfile).update(profile.id, { availability });
      }
    });
    return this.selfView(userId);
  }

  /** RA-8: required checks of a runner (row 126). */
  async verificationSummary(runnerProfileId: string, manager?: EntityManager): Promise<VerificationSummary> {
    const repo = manager ? manager.getRepository(RunnerVerification) : this.verifications;
    const rows = await repo.find({
      where: { runnerProfileId },
      select: { id: true, verificationType: true, side: true, status: true, createdAt: true },
    });
    return verificationSummaryOf(rows);
  }

  /** 403 runner_not_verified (`verification`: the summary) unless every required check is approved. */
  async assertVerified(runnerProfileId: string, manager?: EntityManager): Promise<VerificationSummary> {
    const summary = await this.verificationSummary(runnerProfileId, manager);
    if (!summary.verified) {
      throw new ApiError(
        HttpStatus.FORBIDDEN,
        'runner_not_verified',
        'You can go online and take jobs once your verification is approved',
        { verification: summary },
      );
    }
    return summary;
  }

  /**
   * RA-8, RA-20, inside the caller's accept transaction: the runner must be
   * verified (403 runner_not_verified), online (409 runner_offline) and not
   * already on a job (409 runner_busy, one active job at a time); the
   * profile becomes `busy`. The profile row stays locked until the caller
   * commits, so two accepts by one runner cannot both pass.
   */
  async startJob(runnerProfileId: string, manager: EntityManager): Promise<void> {
    const profile = await this.lockProfile(manager, runnerProfileId);
    await this.assertVerified(profile.id, manager);
    if (profile.availability === RunnerAvailability.BUSY) {
      throw new ApiError(HttpStatus.CONFLICT, 'runner_busy', 'Finish your active job first');
    }
    if (profile.availability !== RunnerAvailability.ONLINE) {
      throw new ApiError(HttpStatus.CONFLICT, 'runner_offline', 'Go online to accept jobs');
    }
    await manager.getRepository(RunnerProfile).update(profile.id, { availability: RunnerAvailability.BUSY });
  }

  /** RA-20, inside the caller's transaction: the job ended, `busy` -> `online`. */
  async endJob(runnerProfileId: string, manager: EntityManager): Promise<void> {
    const profile = await this.lockProfile(manager, runnerProfileId);
    if (profile.availability === RunnerAvailability.BUSY) {
      await manager.getRepository(RunnerProfile).update(profile.id, { availability: RunnerAvailability.ONLINE });
    }
  }

  /**
   * Runner `_shared.md` §9: the phone check is approved by the OTP sign-in.
   * Called after a successful runner OTP verification; records one approved
   * `phone` verification when none is approved yet (no reviewer).
   * Idempotent under concurrent sign-ins: the check and the insert run under
   * the runner profile's row lock, so a second sign-in waits and then sees
   * the first one's row (no schema change, reviewer minor 8).
   */
  async ensurePhoneVerified(userId: string): Promise<void> {
    const profile = await this.profiles.findOne({ where: { userId } });
    if (!profile) {
      return;
    }
    await this.profiles.manager.transaction(async (manager) => {
      await this.lockProfile(manager, profile.id);
      const repo = manager.getRepository(RunnerVerification);
      const approved = await repo.count({
        where: {
          runnerProfileId: profile.id,
          verificationType: RunnerVerificationType.PHONE,
          status: VerificationStatus.APPROVED,
        },
      });
      if (approved === 0) {
        await repo.save(
          repo.create({
            runnerProfileId: profile.id,
            verificationType: RunnerVerificationType.PHONE,
            status: VerificationStatus.APPROVED,
            documentS3Key: null,
            reviewedAt: new Date(),
          }),
        );
      }
    });
  }

  /** RA-18: `GET /runners/me`. */
  async selfView(userId: string): Promise<RunnerSelfView> {
    const profile = await this.profileByUserId(userId);
    const [skills, areas, names, verification] = await Promise.all([
      this.skills.find({ where: { runnerProfileId: profile.id } }),
      this.serviceAreas.find({ where: { runnerProfileId: profile.id } }),
      this.users.displayNames([profile.userId]),
      this.verificationSummary(profile.id),
    ]);
    const displayName = names.get(profile.userId) ?? null;
    return {
      id: profile.id,
      userId: profile.userId,
      displayName,
      shortName: shortNameOf(displayName),
      verificationLevel: profile.verificationLevel,
      availability: profile.availability,
      avgRating: profile.avgRating,
      errandsCompleted: profile.errandsCompleted,
      completionRate: profile.completionRate,
      maxPurchaseAdvance: profile.maxPurchaseAdvance,
      lastPingAt: profile.lastPingAt,
      skills: skills.map((r) => r.skill).sort(bySkillOrder),
      serviceAreas: this.listedAreas(areas.map((a) => a.area)),
      verification,
    };
  }

  /**
   * The runners a task may go to by who they are (System Design §3.3
   * "Pool"): an active account, every required check approved (row 126),
   * the task's category in their skills (row 115) and, when service areas
   * are configured (RUNNER_SERVICE_AREAS, row 212), one of their areas
   * containing the task's first point (rows 116, 213). A task point inside
   * no configured area has no pool. Without areas configured, or without a
   * task point, the area rule is skipped. Availability (online, offline,
   * busy), the purchase limit and earlier offers are the caller's to apply.
   */
  async poolFor(
    category: RunnerSkill,
    point: { lat: number; lng: number } | null,
    manager?: EntityManager,
  ): Promise<PoolRunner[]> {
    const repo = <T extends object>(entity: new () => T, own: Repository<T>): Repository<T> =>
      manager ? manager.getRepository(entity) : own;
    let ids = (
      await repo(RunnerSkillEntity, this.skills).find({ where: { skill: category }, select: { runnerProfileId: true } })
    ).map((r) => r.runnerProfileId);
    const areas = this.areaList();
    if (ids.length > 0 && areas.length > 0 && point) {
      const containing = areasContaining(point, areas);
      if (containing.length === 0) {
        return [];
      }
      const inArea = await repo(RunnerServiceArea, this.serviceAreas).find({
        where: { runnerProfileId: In(ids), area: In(containing) },
        select: { runnerProfileId: true },
      });
      const keep = new Set(inArea.map((r) => r.runnerProfileId));
      ids = ids.filter((id) => keep.has(id));
    }
    if (ids.length === 0) {
      return [];
    }
    // Sequential: with `manager` both reads share the caller's connection.
    const profiles = await repo(RunnerProfile, this.profiles).find({ where: { id: In(ids) } });
    const checks = await repo(RunnerVerification, this.verifications).find({
      where: { runnerProfileId: In(ids) },
      select: { id: true, runnerProfileId: true, verificationType: true, side: true, status: true, createdAt: true },
    });
    const byRunner = new Map<string, RunnerVerification[]>();
    for (const c of checks) {
      byRunner.set(c.runnerProfileId, [...(byRunner.get(c.runnerProfileId) ?? []), c]);
    }
    const verified = profiles.filter((p) => verificationSummaryOf(byRunner.get(p.id) ?? []).verified);
    const active = await this.users.activeDisplayNames(verified.map((p) => p.userId));
    return verified
      .filter((p) => active.has(p.userId))
      .map((p) => ({ profile: p, displayName: active.get(p.userId) ?? null }));
  }

  /**
   * Row 233 (owner, 2026-10-19): true when the point is inside a configured
   * service area (RUNNER_SERVICE_AREAS, circles, row 213), or when no area
   * is configured (the check is off).
   */
  inServiceArea(point: { lat: number; lng: number }): boolean {
    const areas = this.areaList();
    return areas.length === 0 || areasContaining(point, areas).length > 0;
  }

  /** Row 116: the ops-configured areas, by name (`GET /runners/service-areas`). */
  serviceAreaOptions(): { items: ServiceAreaOption[] } {
    return { items: serviceAreaOptionsOf(this.areaList()) };
  }

  private areaList(): ServiceArea[] {
    return this.config?.get<ServiceArea[]>('runners.serviceAreas', []) ?? [];
  }

  /** Stored area ids that are still listed, as options (by name); unlisted ids are left out. */
  private listedAreas(ids: string[]): ServiceAreaOption[] {
    const stored = new Set(ids);
    return serviceAreaOptionsOf(this.areaList().filter((a) => stored.has(a.id)));
  }

  private async lockProfile(manager: EntityManager, id: string): Promise<RunnerProfile> {
    const profile = await manager
      .getRepository(RunnerProfile)
      .findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
    if (!profile) {
      throw new NotFoundException('Runner profile not found');
    }
    return profile;
  }

  /**
   * Records a verification without an image (e.g. payment identity). ID and
   * selfie images go through `uploadVerificationDocument`; a client-supplied
   * storage key is never accepted (400 verification_document_upload_required).
   */
  async addVerification(
    userId: string,
    verificationType: RunnerVerificationType,
    documentS3Key?: string | null,
  ): Promise<RunnerVerificationView> {
    if (documentS3Key || DOCUMENT_VERIFICATION_TYPES.includes(verificationType)) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'verification_document_upload_required',
        'Upload the image with POST /runners/me/verifications/documents',
      );
    }
    const profile = await this.profileByUserId(userId);
    const saved = await this.verifications.save(
      this.verifications.create({ runnerProfileId: profile.id, verificationType, documentS3Key: null }),
    );
    return toRunnerVerificationView(saved);
  }

  /**
   * RA-7 (rows 125, 154): stores an ID or selfie image in restricted storage
   * and records a pending verification for it, logging the upload. Errors:
   * 400 verification_type_not_uploadable, verification_document_type_invalid
   * (also when the bytes are not that image type), verification_document_empty;
   * 413 verification_document_too_large. If the row cannot be written the
   * stored image is deleted again. Row 263: the upload is the newest record
   * of its check, so a runner at `2_id_verified` drops to `1_basic` in the
   * same transaction (profile row locked); levels 3 and 4 are not touched.
   */
  async uploadVerificationDocument(
    userId: string,
    verificationType: RunnerVerificationType,
    file: UploadedImage | undefined,
    ip: string | null,
    sideInput?: string | null,
  ): Promise<RunnerVerificationView> {
    if (!DOCUMENT_VERIFICATION_TYPES.includes(verificationType)) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'verification_type_not_uploadable',
        'Only government_id and selfie images are uploaded',
      );
    }
    const side = documentSideOf(verificationType, sideInput);
    if (!file || !file.buffer || file.size === 0) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'verification_document_empty', 'Attach the image as `file`');
    }
    // Multer already stops at the limit; checked again before anything is stored.
    const maxBytes = idMaxUploadBytes(this.config);
    if (file.size > maxBytes || file.buffer.length > maxBytes) {
      throw documentTooLarge(maxBytes);
    }
    if (!DOCUMENT_CONTENT_TYPES.includes(file.mimetype) || !matchesImageSignature(file.buffer, file.mimetype)) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'verification_document_type_invalid',
        'Upload a JPEG, PNG, WebP or HEIC photo',
        { allowed: DOCUMENT_CONTENT_TYPES },
      );
    }
    const profile = await this.profileByUserId(userId);
    const { key } = await this.documents.upload({
      data: file.buffer,
      contentType: file.mimetype,
      runnerProfileId: profile.id,
    });
    let saved: RunnerVerification;
    let dropped = false;
    try {
      saved = await this.verifications.manager.transaction(async (manager) => {
        // Row 263: the profile lock comes before the insert (the insert's FK
        // key-share lock would otherwise deadlock two concurrent uploads).
        const locked = await this.lockProfile(manager, profile.id);
        const row = await manager.getRepository(RunnerVerification).save(
          manager.getRepository(RunnerVerification).create({
            runnerProfileId: profile.id,
            verificationType,
            side,
            documentS3Key: key,
          }),
        );
        await this.logAccess(manager, row, VerificationDocumentAction.UPLOAD, userId, ip);
        // A new pending ID side or selfie is the newest record of its check: Level 2 -> 1.
        dropped = await this.syncIdVerifiedLevel(manager, locked);
        return row;
      });
    } catch (err) {
      // Review minor 4: no stored image without its row. Best effort; a
      // failed delete is logged with the key so ops can remove it.
      await this.documents.destroy(key).catch((cleanup: unknown) =>
        this.logger.error(
          `Orphan verification image ${key} could not be deleted: ${cleanup instanceof Error ? cleanup.message : String(cleanup)}`,
        ),
      );
      throw err;
    }
    if (dropped) {
      await this.levelDropped(profile.id, 'upload');
    }
    return toRunnerVerificationView(saved);
  }

  /**
   * Admin only (rows 125, 154): a signed URL to the image, valid at most
   * 5 minutes; every call is logged with the admin and IP. Errors: 404;
   * 410 verification_document_purged; 404 verification_document_missing.
   * `url` is null when the storage driver cannot serve (console).
   */
  async documentLink(
    verificationId: string,
    adminUserId: string,
    ip: string | null,
  ): Promise<{ verificationId: string; url: string | null; expiresAt: Date | null }> {
    const verification = await this.verifications.findOne({ where: { id: verificationId } });
    if (!verification) {
      throw new NotFoundException('Verification not found');
    }
    if (verification.purgedAt) {
      throw new ApiError(HttpStatus.GONE, 'verification_document_purged', 'The image was deleted at the end of its retention period', {
        purgedAt: verification.purgedAt,
      });
    }
    if (!verification.documentS3Key) {
      throw new ApiError(HttpStatus.NOT_FOUND, 'verification_document_missing', 'No image is stored for this verification');
    }
    const ttl = Math.min(
      this.config?.get<number>('runnerVerification.signedUrlTtlSeconds', MAX_DOCUMENT_URL_TTL_SECONDS) ??
        MAX_DOCUMENT_URL_TTL_SECONDS,
      MAX_DOCUMENT_URL_TTL_SECONDS,
    );
    await this.logAccess(this.verifications.manager, verification, VerificationDocumentAction.VIEW, adminUserId, ip);
    const view = this.documents.viewUrl(verification.documentS3Key, ttl);
    return { verificationId, url: view.url, expiresAt: view.expiresAt };
  }

  /**
   * Rows 161, 171, 191 (owner, 2026-10-16): the runner's retention clock is
   * the latest of
   *  (a)/(b)/(c) a verification that creates or replaces stored identity
   *  evidence: `createdAt` of the runner's government_id and selfie rows
   *  (payment identity stores no image today, so it does not count; it
   *  would only if it reused the retained images);
   *  (d) an admin review that needs the stored evidence: the decision on a
   *  pending ID/selfie verification (`reviewedAt`, the initial review) and
   *  every audited "Re-review evidence" (`re_review` log rows, row 171).
   * Views never count; task assignments, offers and disputes do not count.
   * Returns the decided, still-stored images whose runner's clock is older
   * than `runnerVerification.retentionDays` (default 365). The pending guard
   * is here; the open-dispute guard is applied by the caller (row 175).
   */
  async documentsDueForPurge(
    now: Date = new Date(),
    batch = 200,
    opts: { onlyRunnerProfileIds?: string[]; excludeRunnerProfileIds?: string[]; excludeIds?: string[] } = {},
  ): Promise<{ id: string; runnerProfileId: string }[]> {
    const days = this.retentionDays();
    return this.verifications.query(
      `WITH clock AS (${RETENTION_CLOCK_SQL})
       SELECT v.id, v."runnerProfileId" FROM "runner_verifications" v
         JOIN clock c ON c.runner = v."runnerProfileId"
        WHERE v."documentS3Key" IS NOT NULL AND v."purgedAt" IS NULL AND v.status::text <> 'pending'
          AND c.at < $1::timestamptz - make_interval(days => $2::int)
          AND ($4::uuid[] IS NULL OR v."runnerProfileId" = ANY($4::uuid[]))
          AND NOT (v."runnerProfileId" = ANY($5::uuid[]))
          AND NOT (v.id = ANY($6::uuid[]))
        ORDER BY v."createdAt" ASC
        LIMIT $3`,
      [
        now.toISOString(),
        days,
        batch,
        opts.onlyRunnerProfileIds ?? null,
        opts.excludeRunnerProfileIds ?? [],
        opts.excludeIds ?? [],
      ],
    );
  }

  /**
   * Row 154/161 purge of the given verifications, each re-checked first
   * (still stored, not pending, clock still past retention). Deletes the
   * image permanently (storage + backups), then keeps only the minimum audit
   * record (row 170): status/outcome, timestamps, reviewer id, `purgedAt`,
   * evidence type and the log ids. The storage key and the reviewer's note
   * are cleared. Logs a `purge` row. A storage failure leaves the row as it
   * is (retried the next day). Callers pass the open-dispute hold (`isHeld`),
   * checked with the row locked just before the delete.
   */
  async purgeDocuments(
    ids: string[],
    now: Date = new Date(),
    /** Row 175 hold, re-checked inside the purge transaction (reviewer minor 3). */
    isHeld?: (runnerProfileId: string, manager: EntityManager) => Promise<boolean>,
  ): Promise<string[]> {
    const days = this.retentionDays();
    const purged: string[] = [];
    for (const id of ids) {
      try {
        const done = await this.verifications.manager.transaction(async (manager) => {
          // Locked so a concurrent re-review or decision waits for (or beats) the purge.
          const row = await manager
            .getRepository(RunnerVerification)
            .findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
          if (!row?.documentS3Key || row.purgedAt || row.status === VerificationStatus.PENDING) {
            return false;
          }
          const at = await this.retentionClockOf(row.runnerProfileId, manager);
          if (at && at.getTime() >= now.getTime() - days * 86_400_000) {
            return false; // Restarted meanwhile (new upload, decision or re-review).
          }
          if (isHeld && (await isHeld(row.runnerProfileId, manager))) {
            return false; // A dispute opened meanwhile (row 175).
          }
          // Storage first: a failure rolls back and leaves the row for the next run.
          await this.documents.destroy(row.documentS3Key);
          await manager
            .getRepository(RunnerVerification)
            .update({ id: row.id }, { documentS3Key: null, reviewerNote: null, purgedAt: now });
          // Row 170: re-review notes go with the reviewer's note.
          await manager.query(
            `UPDATE "verification_document_access_log" SET "note" = NULL
              WHERE "verificationId" = $1 AND "action"::text = 're_review' AND "note" IS NOT NULL`,
            [row.id],
          );
          await this.logAccess(manager, row, VerificationDocumentAction.PURGE, null, null);
          return true;
        });
        if (done) {
          purged.push(id);
        }
      } catch (err) {
        this.logger.error(`Could not purge verification image ${id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return purged;
  }

  /** The runner's retention clock (see `documentsDueForPurge`), or null without verifications. */
  async retentionClockOf(runnerProfileId: string, manager?: EntityManager): Promise<Date | null> {
    const rows: { at: Date | null }[] = await (manager ?? this.verifications.manager).query(
      `WITH clock AS (${RETENTION_CLOCK_SQL}) SELECT at FROM clock WHERE runner = $1`,
      [runnerProfileId],
    );
    return rows[0]?.at ?? null;
  }

  /**
   * Row 171: explicit, audited admin "Re-review evidence" on an already
   * decided ID/selfie verification whose image is still stored. In one
   * transaction, with the verification row locked (so it cannot race the
   * purge): writes the `re_review` event (admin, IP, time, verification,
   * evidence type, optional note: trimmed, blank = none, over 500 -> 400
   * re_review_note_invalid), which restarts the retention clock.
   * It never changes the decision (row 181, decided). A pending
   * verification is not re-reviewed: its decision is the initial review.
   * Errors: 404; 409 verification_not_decided; 410
   * verification_document_purged; 404 verification_document_missing.
   */
  async reReviewDocument(
    verificationId: string,
    adminUserId: string,
    ip: string | null,
    noteInput?: string | null,
  ): Promise<{ verificationId: string; reReview: ReReviewView }> {
    // Trimmed first; blank -> no note; over 500 after trim -> 400.
    const trimmed = typeof noteInput === 'string' ? noteInput.trim() : '';
    if (trimmed.length > RE_REVIEW_NOTE_MAX) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 're_review_note_invalid', `Keep the note to ${RE_REVIEW_NOTE_MAX} characters`, {
        maxLength: RE_REVIEW_NOTE_MAX,
      });
    }
    const note = trimmed || null;
    const event = await this.verifications.manager.transaction(async (manager) => {
      const verification = await manager
        .getRepository(RunnerVerification)
        .findOne({ where: { id: verificationId }, lock: { mode: 'pessimistic_write' } });
      if (!verification) {
        throw new NotFoundException('Verification not found');
      }
      if (verification.purgedAt) {
        throw new ApiError(HttpStatus.GONE, 'verification_document_purged', 'The image was deleted at the end of its retention period', {
          purgedAt: verification.purgedAt,
        });
      }
      if (!verification.documentS3Key) {
        throw new ApiError(HttpStatus.NOT_FOUND, 'verification_document_missing', 'No image is stored for this verification');
      }
      if (verification.status === VerificationStatus.PENDING) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'verification_not_decided',
          'Decide the verification first; that decision is its review',
          { status: verification.status },
        );
      }
      return this.logAccess(manager, verification, VerificationDocumentAction.RE_REVIEW, adminUserId, ip, note);
    });
    const names = await this.users.displayNames([adminUserId]);
    return {
      verificationId,
      reReview: {
        id: event.id,
        reviewedBy: { id: adminUserId, displayName: names.get(adminUserId) ?? null },
        createdAt: event.createdAt,
        note: event.note ?? null,
      },
    };
  }

  /** Re-reviews per verification, oldest first (row 171). */
  private async reReviewsOf(verificationIds: string[]): Promise<Map<string, ReReviewView[]>> {
    const out = new Map<string, ReReviewView[]>();
    if (verificationIds.length === 0) {
      return out;
    }
    const rows = await this.verifications.manager.getRepository(VerificationDocumentAccessLog).find({
      where: { verificationId: In(verificationIds), action: VerificationDocumentAction.RE_REVIEW },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    const names = await this.users.displayNames(rows.map((r) => r.actorUserId).filter((v): v is string => !!v));
    for (const r of rows) {
      const list = out.get(r.verificationId) ?? [];
      const actor = r.actorUserId as string; // Required by the DB check (see ReReviewView).
      list.push({
        id: r.id,
        reviewedBy: { id: actor, displayName: names.get(actor) ?? null },
        createdAt: r.createdAt,
        note: r.note ?? null,
      });
      out.set(r.verificationId, list);
    }
    return out;
  }

  private retentionDays(): number {
    return this.config?.get<number>('runnerVerification.retentionDays', 365) ?? 365;
  }

  private async logAccess(
    manager: EntityManager,
    verification: Pick<RunnerVerification, 'id' | 'runnerProfileId'>,
    action: VerificationDocumentAction,
    actorUserId: string | null,
    ip: string | null,
    note: string | null = null,
  ): Promise<VerificationDocumentAccessLog> {
    const repo = manager.getRepository(VerificationDocumentAccessLog);
    return repo.save(
      repo.create({
        verificationId: verification.id,
        runnerProfileId: verification.runnerProfileId,
        actorUserId,
        action,
        ip: ip ? ip.slice(0, 64) : null,
        note,
      }),
    );
  }

  /** `GET /runners/me/verifications`: the runner's own checks, newest first, without the reviewer's note or id (row 262, A-8). */
  async verificationsByUserId(userId: string): Promise<RunnerVerificationView[]> {
    const rows = await this.verifications
      .createQueryBuilder('v')
      .innerJoin(RunnerProfile, 'p', 'p.id = v."runnerProfileId" AND p."userId" = :userId', { userId })
      .orderBy('v."createdAt"', 'DESC')
      .getMany();
    return rows.map(toRunnerVerificationView);
  }

  /**
   * Admin verification queue, newest first. Items never carry the storage
   * key (row 154): `hasDocument` plus `GET /runners/verifications/:id/document`
   * (logged, signed URL) replace it. Includes the runner profile ids and the
   * runner's sign-in phone.
   */
  async listVerificationsForAdmin(opts: {
    limit?: number;
    cursor?: string | null;
    status?: VerificationStatus | null;
  } = {}): Promise<{ items: AdminVerificationView[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
    const { cursor, status } = opts;
    const qb = this.verifications
      .createQueryBuilder('v')
      .orderBy('v."createdAt"', 'DESC')
      .addOrderBy('v.id', 'DESC')
      .limit(limit + 1);
    if (status) {
      qb.andWhere('v.status = :status', { status });
    }
    if (cursor) {
      const [createdAt, id] = Buffer.from(cursor, 'base64').toString('utf-8').split('::');
      if (createdAt && id && !Number.isNaN(Date.parse(createdAt))) {
        qb.andWhere('(v."createdAt", v.id) < (:createdAt, :id)', { createdAt: new Date(createdAt), id });
      }
    }
    const rows = await qb.getMany();
    let nextCursor: string | null = null;
    if (rows.length > limit) {
      rows.pop();
      const last = rows[rows.length - 1];
      nextCursor = Buffer.from(`${last.createdAt.toISOString()}::${last.id}`, 'utf-8').toString('base64');
    }
    return { items: await this.adminVerificationViews(rows), nextCursor };
  }

  /**
   * The admin queue item for each row (same shape for the list and the
   * PATCH answer, so the client can merge). A fixed number of queries per
   * page: profiles, users (phone + display name, one batch, A-6), service
   * areas, re-reviews, reviewer names.
   */
  private async adminVerificationViews(rows: RunnerVerification[]): Promise<AdminVerificationView[]> {
    if (rows.length === 0) {
      return [];
    }
    const runners = await this.adminRunnerRefs(rows.map((r) => r.runnerProfileId));
    const reReviews = await this.reReviewsOf(rows.map((r) => r.id));
    const names = await this.users.displayNames(rows.map((r) => r.reviewedBy).filter((v): v is string => !!v));
    return rows.map((r) => {
      const runner = runners.get(r.runnerProfileId);
      return {
        ...toVerificationView(r),
        runnerProfile: runner?.runnerProfile ?? null,
        user: runner?.user ?? null,
        reviewer: r.reviewedBy ? { id: r.reviewedBy, displayName: names.get(r.reviewedBy) ?? null } : null,
        reReviews: reReviews.get(r.id) ?? [],
      };
    });
  }

  /** Runner and user refs per profile id: four batched queries, whatever the count (row 260, N-L1). */
  private async adminRunnerRefs(
    profileIds: string[],
  ): Promise<Map<string, { runnerProfile: AdminRunnerRef; user: AdminRunnerUser | null }>> {
    const ids = [...new Set(profileIds)];
    const out = new Map<string, { runnerProfile: AdminRunnerRef; user: AdminRunnerUser | null }>();
    if (ids.length === 0) {
      return out;
    }
    const profiles = await this.profiles.find({ where: { id: In(ids) } });
    const contacts = await this.users.contacts(profiles.map((p) => p.userId));
    const areas = await this.serviceAreas.find({ where: { runnerProfileId: In(ids) } });
    const areasOf = new Map<string, string[]>();
    for (const a of areas) {
      areasOf.set(a.runnerProfileId, [...(areasOf.get(a.runnerProfileId) ?? []), a.area]);
    }
    const checks = await this.verifications.find({
      where: { runnerProfileId: In(ids) },
      select: { id: true, runnerProfileId: true, verificationType: true, side: true, status: true, createdAt: true },
    });
    const checksOf = new Map<string, RunnerVerification[]>();
    for (const c of checks) {
      checksOf.set(c.runnerProfileId, [...(checksOf.get(c.runnerProfileId) ?? []), c]);
    }
    for (const p of profiles) {
      const contact = contacts.get(p.userId);
      out.set(p.id, {
        runnerProfile: {
          id: p.id,
          userId: p.userId,
          verificationLevel: p.verificationLevel,
          serviceAreas: this.listedAreas(areasOf.get(p.id) ?? []),
          appliedAt: p.createdAt,
          level2Missing: level2MissingOf(checksOf.get(p.id) ?? []),
        },
        user: contact
          ? {
              id: p.userId,
              phone: contact.phone,
              displayName: contact.displayName,
              shortName: shortNameOf(contact.displayName),
            }
          : null,
      });
    }
    return out;
  }

  /**
   * `GET /runners/verifications/queue` (row 260): the admin verification
   * queue paginated by runner. Runners whose only records are phone checks
   * (approved at sign-in) are not in the queue. "Latest" below is the newest
   * record of each (type, side).
   *  - `pending` (default): at least one latest record pending; oldest
   *    pending (among latest records) first. An older pending record
   *    superseded by a newer upload of the same check does not count (A-9).
   *  - `rejected`: at least one latest record rejected; most recently decided first.
   *  - `approved`: every latest record approved; most recently decided first.
   *  - `all`: every queued runner; most recent submission first.
   * Each item carries all of the runner's records whatever the filter
   * (history included, newest first) plus the required-check summary.
   * `pendingCount` / `oldestPendingAt` are over the latest records too.
   * `total` counts the runners matching the filter; `awaitingReviewCount`
   * counts the runners with a latest record pending across the whole queue.
   * Keyset cursor (opaque, bound to the filter): 400 cursor_invalid
   * otherwise. A fixed number of queries per page (no N+1).
   */
  async verificationQueueForAdmin(opts: {
    status?: VerificationQueueStatus | null;
    cursor?: string | null;
    limit?: number;
  } = {}): Promise<{
    items: AdminVerificationQueueItem[];
    nextCursor: string | null;
    total: number;
    awaitingReviewCount: number;
  }> {
    const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
    const status = opts.status ?? VerificationStatus.PENDING;
    const after = decodeQueueCursor(opts.cursor, status);
    const { filter, sortAt, dir } = QUEUE_FILTERS[status];
    const page: { id: string; sortKey: string; pendingCount: number; oldestPendingAt: Date | null }[] =
      await this.verifications.query(
        `WITH q AS (${QUEUE_BASE_SQL})
         SELECT q.id, q."pendingCount", q."oldestPendingAt",
                to_char(${sortAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "sortKey"
           FROM q
          WHERE ${filter}
            AND ($1::timestamptz IS NULL OR (${sortAt}, q.id) ${dir === 'ASC' ? '>' : '<'} ($1::timestamptz, $2::uuid))
          ORDER BY ${sortAt} ${dir}, q.id ${dir}
          LIMIT $3`,
        [after?.at ?? null, after?.id ?? null, limit + 1],
      );
    const counted: { total: number; awaiting: number }[] = await this.verifications.query(
      `WITH q AS (${QUEUE_BASE_SQL})
       SELECT (COUNT(*) FILTER (WHERE ${filter}))::int AS total,
              (COUNT(*) FILTER (WHERE q."pendingCount" > 0))::int AS awaiting
         FROM q`,
    );
    let nextCursor: string | null = null;
    if (page.length > limit) {
      page.pop();
      const last = page[page.length - 1];
      nextCursor = encodeQueueCursor(status, last.sortKey, last.id);
    }
    const ids = page.map((r) => r.id);
    const rows = ids.length
      ? await this.verifications.find({
          where: { runnerProfileId: In(ids) },
          order: { createdAt: 'DESC', id: 'DESC' },
        })
      : [];
    const views = await this.adminVerificationViews(rows);
    const byRunner = new Map<string, AdminVerificationView[]>();
    for (const v of views) {
      byRunner.set(v.runnerProfileId, [...(byRunner.get(v.runnerProfileId) ?? []), v]);
    }
    const items: AdminVerificationQueueItem[] = [];
    for (const r of page) {
      const checks = byRunner.get(r.id) ?? [];
      const first = checks[0];
      if (!first?.runnerProfile) {
        continue; // A profile deleted under the page; nothing to show.
      }
      items.push({
        runnerProfile: first.runnerProfile,
        user: first.user,
        checks,
        pendingCount: Number(r.pendingCount),
        oldestPendingAt: r.oldestPendingAt ? new Date(r.oldestPendingAt) : null,
        verification: verificationSummaryOf(checks),
      });
    }
    return {
      items,
      nextCursor,
      total: Number(counted[0]?.total ?? 0),
      awaitingReviewCount: Number(counted[0]?.awaiting ?? 0),
    };
  }

  /**
   * `PUT /runners/me/skills` (row 115): replaces the runner's skills with
   * the given category values (1-5 of buy_for_me, pickup_delivery,
   * inspection, representation, queue_admin). `business` is not offered in
   * the MVP (OA-18): 400 skill_not_offered (`allowed`). Returns the saved
   * skills in category order.
   */
  async setSkills(userId: string, skillNames: RunnerSkill[]): Promise<RunnerSkill[]> {
    const profile = await this.profileByUserId(userId);
    const unique = [...new Set(skillNames)];
    const refused = unique.filter((s) => !OFFERED_SKILLS.includes(s));
    if (refused.length > 0) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'skill_not_offered', 'Choose from the offered task types', {
        refused,
        allowed: OFFERED_SKILLS,
      });
    }
    await this.skills.manager.transaction(async (manager) => {
      const repo = manager.getRepository(RunnerSkillEntity);
      const rows = await repo.find({ where: { runnerProfileId: profile.id } });
      const stale = rows.filter((r) => !unique.includes(r.skill));
      if (stale.length > 0) {
        await repo.delete({ id: In(stale.map((r) => r.id)) });
      }
      const have = new Set(rows.map((r) => r.skill));
      const fresh = unique.filter((s) => !have.has(s));
      if (fresh.length > 0) {
        await repo.save(fresh.map((skill) => repo.create({ runnerProfileId: profile.id, skill })));
      }
    });
    return [...unique].sort(bySkillOrder);
  }

  /**
   * `PUT /runners/me/service-areas` (row 116): replaces the runner's areas
   * with listed area ids (0-50). 400 service_area_unknown (`unknown`) for an
   * id not on the ops list. Returns the saved areas by name.
   */
  async setServiceAreas(userId: string, areas: string[]): Promise<ServiceAreaOption[]> {
    const profile = await this.profileByUserId(userId);
    const ids = listedAreaIds(areas, this.areaList());
    await this.serviceAreas.manager.transaction(async (manager) => {
      const repo = manager.getRepository(RunnerServiceArea);
      await repo.delete({ runnerProfileId: profile.id });
      if (ids.length > 0) {
        await repo.save(ids.map((area) => repo.create({ runnerProfileId: profile.id, area })));
      }
    });
    return this.listedAreas(ids);
  }

  /** Admin ops list: live runner directory with verification + load summary. */
  async listForAdmin(opts: {
    limit?: number;
    cursor?: string | null;
  }): Promise<{ items: (RunnerProfile & { skillsCount: number })[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
    const qb = this.profiles
      .createQueryBuilder('p')
      .orderBy('p."createdAt"', 'DESC')
      .addOrderBy('p.id', 'DESC')
      .limit(limit + 1);

    const decoded = decodeCursor(opts.cursor);
    if (decoded) {
      const [createdAt, id] = decoded;
      qb.andWhere(
        '(p."createdAt" < :createdAt OR (p."createdAt" = :createdAt AND p.id < :id))',
        { createdAt: new Date(createdAt), id },
      );
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];

    const counts = await this.skillCounts(page.map((p) => p.id));
    return {
      // eslint-disable-next-line no-misused-spread -- entity → admin-list DTO shape
      items: page.map((p) => ({ ...p, skillsCount: counts[p.id] ?? 0 })),
      nextCursor: hasMore && last ? encodeCursor(last) : null,
    };
  }

  private async skillCounts(profileIds: string[]): Promise<Record<string, number>> {
    if (profileIds.length === 0) {
      return {};
    }
    const rows = await this.skills
      .createQueryBuilder('s')
      .select('s."runnerProfileId"', 'pid')
      .addSelect('COUNT(*)', 'cnt')
      .where('s."runnerProfileId" IN (:...ids)', { ids: profileIds })
      .groupBy('s."runnerProfileId"')
      .getRawMany<{ pid: string; cnt: string }>();
    return Object.fromEntries(rows.map((r) => [r.pid, Number(r.cnt)]));
  }

  /**
   * Admin review of a runner verification submission. The verification must
   * belong to `runnerProfileId` (A-1: else 404, as for an unknown id). Only a
   * pending check can be decided: 409 verification_already_decided
   * (`status`) otherwise (A-2), also when a second admin's decision lands
   * between the read and the write. `reviewerNote` is optional, trimmed,
   * blank -> null, at most 500 characters (row 262: 400
   * reviewer_note_invalid, `maxLength`); it is internal and never shown to
   * the runner. Deciding an ID side or the selfie re-evaluates Level 2
   * (rows 261, 263, `meetsIdVerifiedRule`): `1_basic` -> `2_id_verified`
   * when the newest ID front, ID back and selfie are all approved, and
   * `2_id_verified` -> `1_basic` when one of them is not (a rejection of the
   * newest record). Deciding a superseded older record changes nothing,
   * since the rule reads the newest records. The decision and the level
   * change commit together; the profile row is locked so two decisions
   * landing at once cannot both miss the change. Levels 3 and 4 are never
   * touched. Returns the admin queue item shape (A-3).
   */
  async reviewVerification(
    runnerProfileId: string,
    verificationId: string,
    review: { decision: 'approved' | 'rejected'; reviewerNote?: string | null },
    adminUserId: string,
  ): Promise<AdminVerificationView> {
    const reviewerNote = reviewerNoteOf(review.reviewerNote);
    let dropped = false;
    const verification = await this.verifications.manager.transaction(async (manager) => {
      const repo = manager.getRepository(RunnerVerification);
      const row = await repo.findOne({ where: { id: verificationId, runnerProfileId } });
      if (!row) {
        throw new NotFoundException('Verification not found');
      }
      if (row.status !== VerificationStatus.PENDING) {
        throw alreadyDecided(row.status);
      }
      const decided = {
        status: review.decision === 'approved' ? VerificationStatus.APPROVED : VerificationStatus.REJECTED,
        reviewerNote,
        reviewedBy: adminUserId,
        reviewedAt: new Date(),
      };
      // Conditional write: only a still-pending row is decided (two admins clicking at once).
      const result = await repo.update({ id: row.id, status: VerificationStatus.PENDING }, decided);
      if (!result.affected) {
        const now = await repo.findOne({ where: { id: row.id } });
        throw alreadyDecided(now?.status ?? null);
      }
      Object.assign(row, decided);
      if (ID_VERIFIED_TYPES.has(row.verificationType)) {
        dropped = await this.syncIdVerifiedLevel(manager, await this.lockProfile(manager, row.runnerProfileId));
      }
      return row;
    });
    if (dropped) {
      await this.levelDropped(runnerProfileId, 'decision');
    }
    const [view] = await this.adminVerificationViews([verification]);
    return view;
  }

  /**
   * Rows 261, 263, inside the decision's or upload's transaction, with the
   * profile row already locked by the caller (after a decision write, before
   * an upload insert) and the checks read after the lock, so of two
   * concurrent writes the second one sees the first: `1_basic` <->
   * `2_id_verified` following `meetsIdVerifiedRule`. Levels 3 and 4 are
   * never changed here (owner question open).
   */
  private async syncIdVerifiedLevel(manager: EntityManager, profile: RunnerProfile): Promise<boolean> {
    const level = profile.verificationLevel;
    if (level !== VerificationLevel.ONE_BASIC && level !== VerificationLevel.TWO_ID_VERIFIED) {
      return false;
    }
    const rows = await manager.getRepository(RunnerVerification).find({
      where: { runnerProfileId: profile.id },
      select: { id: true, verificationType: true, side: true, status: true, createdAt: true },
    });
    const target = meetsIdVerifiedRule(rows) ? VerificationLevel.TWO_ID_VERIFIED : VerificationLevel.ONE_BASIC;
    if (target !== level) {
      await manager.getRepository(RunnerProfile).update(profile.id, { verificationLevel: target });
      profile.verificationLevel = target;
    }
    return target === VerificationLevel.ONE_BASIC && level === VerificationLevel.TWO_ID_VERIFIED;
  }

  /** After commit: tells the errands module (row 266). Listeners never throw. */
  private async levelDropped(runnerProfileId: string, cause: RunnerLevelDroppedEvent['cause']): Promise<void> {
    await this.events?.emitAsync(RUNNER_LEVEL_DROPPED_EVENT, {
      runnerProfileId,
      from: VerificationLevel.TWO_ID_VERIFIED,
      to: VerificationLevel.ONE_BASIC,
      cause,
      at: new Date().toISOString(),
    } satisfies RunnerLevelDroppedEvent);
  }
}

/** Row 262: optional, trimmed, blank -> null, at most 500 characters. */
export const REVIEWER_NOTE_MAX = 500;

export const reviewerNoteOf = (input: string | null | undefined): string | null => {
  const trimmed = typeof input === 'string' ? input.trim() : '';
  if (trimmed.length > REVIEWER_NOTE_MAX) {
    throw new ApiError(HttpStatus.BAD_REQUEST, 'reviewer_note_invalid', `Keep the note to ${REVIEWER_NOTE_MAX} characters`, {
      maxLength: REVIEWER_NOTE_MAX,
    });
  }
  return trimmed || null;
};

/** A-2: 409 for a check that is no longer pending, with its current status. */
const alreadyDecided = (status: VerificationStatus | null): ApiError =>
  conflict('verification_already_decided', 'This verification was already decided', { status });

/**
 * Per runner: the latest retention event (rows 161, 171). See
 * `RunnersService.documentsDueForPurge`.
 */
const RETENTION_CLOCK_SQL = `
  SELECT v."runnerProfileId" AS runner,
         GREATEST(
           MAX(v."createdAt") FILTER (WHERE v."verificationType"::text IN ('government_id', 'selfie')),
           MAX(v."reviewedAt") FILTER (WHERE v."verificationType"::text IN ('government_id', 'selfie')),
           (SELECT MAX(l."createdAt") FROM "verification_document_access_log" l
             WHERE l."runnerProfileId" = v."runnerProfileId" AND l.action::text = 're_review')
         ) AS at
    FROM "runner_verifications" v
   GROUP BY v."runnerProfileId"`;

const encodeCursor = (profile: RunnerProfile): string =>
  Buffer.from(`${profile.createdAt.toISOString()}::${profile.id}`, 'utf-8').toString('base64');

const decodeCursor = (cursor: string | null | undefined): [string, string] | null => {
  if (!cursor) {
    return null;
  }
  try {
    const [createdAt, id] = Buffer.from(cursor, 'base64')
      .toString('utf-8')
      .split('::');
    return createdAt && id ? [createdAt, id] : null;
  } catch {
    return null;
  }
};

/**
 * Per runner with at least one non-phone record (row 260): last submission
 * and last decision over every record; over the latest record of each
 * (type, side) the pending count, the oldest pending submission, and whether
 * all are approved / any is rejected (A-9, row 264: an older pending record
 * superseded by a newer upload of the same check is not counted).
 */
const QUEUE_BASE_SQL = `
  SELECT g.id, l."pendingCount", l."oldestPendingAt", g."lastSubmittedAt", g."lastDecidedAt",
         l."allApproved", l."anyRejected"
    FROM (
      SELECT v."runnerProfileId" AS id,
             MAX(v."createdAt") AS "lastSubmittedAt",
             MAX(COALESCE(v."reviewedAt", v."createdAt")) FILTER (WHERE v.status::text <> 'pending') AS "lastDecidedAt",
             bool_or(v."verificationType"::text <> 'phone') AS "hasReviewable"
        FROM "runner_verifications" v
       GROUP BY v."runnerProfileId"
    ) g
    JOIN (
      SELECT latest."runnerProfileId" AS id,
             (COUNT(*) FILTER (WHERE latest.status = 'pending'))::int AS "pendingCount",
             MIN(latest."createdAt") FILTER (WHERE latest.status = 'pending') AS "oldestPendingAt",
             bool_and(latest.status = 'approved') AS "allApproved",
             bool_or(latest.status = 'rejected') AS "anyRejected"
        FROM (
          SELECT DISTINCT ON (v."runnerProfileId", v."verificationType", v.side)
                 v."runnerProfileId", v.status::text AS status, v."createdAt"
            FROM "runner_verifications" v
           ORDER BY v."runnerProfileId", v."verificationType", v.side, v."createdAt" DESC, v.id DESC
        ) latest
       GROUP BY latest."runnerProfileId"
    ) l ON l.id = g.id
   WHERE g."hasReviewable"`;

/** Filter, sort column and direction of each queue `status` (row 260). */
const QUEUE_FILTERS: Record<VerificationQueueStatus, { filter: string; sortAt: string; dir: 'ASC' | 'DESC' }> = {
  [VerificationStatus.PENDING]: { filter: 'q."pendingCount" > 0', sortAt: 'q."oldestPendingAt"', dir: 'ASC' },
  [VerificationStatus.REJECTED]: { filter: 'q."anyRejected"', sortAt: 'q."lastDecidedAt"', dir: 'DESC' },
  [VerificationStatus.APPROVED]: { filter: 'q."allApproved"', sortAt: 'q."lastDecidedAt"', dir: 'DESC' },
  all: { filter: 'TRUE', sortAt: 'q."lastSubmittedAt"', dir: 'DESC' },
};

/** Opaque keyset cursor of the runner queue; bound to its `status` so a cursor of another filter is refused. */
const encodeQueueCursor = (status: VerificationQueueStatus, at: string, id: string): string =>
  Buffer.from(JSON.stringify({ s: status, at, id }), 'utf-8').toString('base64url');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const decodeQueueCursor = (
  cursor: string | null | undefined,
  status: VerificationQueueStatus,
): { at: string; id: string } | null => {
  if (!cursor) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8')) as { s?: unknown; at?: unknown; id?: unknown };
    if (
      parsed.s === status &&
      typeof parsed.at === 'string' &&
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
