import { HttpStatus, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiError } from '../common/api-error';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import {
  RunnerAvailability,
  RunnerSkill,
  RunnerVerificationType,
  VerificationLevel,
  VerificationStatus,
} from '../common/enums';
import { RunnerProfile } from './runner-profile.entity';
import { RunnerServiceArea, RunnerSkillEntity } from './runner-skill.entity';
import { RunnerVerification } from './runner-verification.entity';
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
  reviewedBy: { id: string; displayName: string | null } | null;
  createdAt: Date;
  note: string | null;
}

export type AdminVerificationView = VerificationView & {
  runnerProfile: { id: string; userId: string } | null;
  user: { id: string; phone: string | null } | null;
  /** The admin who decided, with a display name (round-10 spec). */
  reviewer: { id: string; displayName: string | null } | null;
  /** Re-reviews of the evidence, oldest first (row 171). */
  reReviews: ReReviewView[];
};

/** Row 171: optional re-review note length (the round-10 spec proposal; owner row 180 open). */
export const RE_REVIEW_NOTE_MAX = 500;

export const toVerificationView = (v: RunnerVerification): VerificationView => {
  const { documentS3Key, ...rest } = v;
  return { ...rest, purgedAt: v.purgedAt ?? null, hasDocument: !!documentS3Key };
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
      serviceAreas: serviceAreas.map((a) => a.area),
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
   * Last-known runner position for live tracking. Returns null when the
   * runner has never pinged.
   */
  async lastKnownLocation(
    id: string,
  ): Promise<{ lat: number; lng: number; capturedAt: Date | null } | null> {
    const profile = await this.profiles.findOne({ where: { id } });
    if (!profile?.currentLocation) {
      return null;
    }
    const [lng, lat] = profile.currentLocation.coordinates;
    return { lat, lng, capturedAt: profile.lastPingAt };
  }

  async setAvailability(userId: string, availability: RunnerAvailability): Promise<RunnerProfile> {
    const profile = await this.profileByUserId(userId);
    profile.availability = availability;
    return this.profiles.save(profile);
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
  ): Promise<VerificationView> {
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
    return toVerificationView(saved);
  }

  /**
   * RA-7 (rows 125, 154): stores an ID or selfie image in restricted storage
   * and records a pending verification for it, logging the upload. Errors:
   * 400 verification_type_not_uploadable, verification_document_type_invalid
   * (also when the bytes are not that image type), verification_document_empty;
   * 413 verification_document_too_large. If the row cannot be written the
   * stored image is deleted again.
   */
  async uploadVerificationDocument(
    userId: string,
    verificationType: RunnerVerificationType,
    file: UploadedImage | undefined,
    ip: string | null,
  ): Promise<VerificationView> {
    if (!DOCUMENT_VERIFICATION_TYPES.includes(verificationType)) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'verification_type_not_uploadable',
        'Only government_id and selfie images are uploaded',
      );
    }
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
    try {
      saved = await this.verifications.manager.transaction(async (manager) => {
        const row = await manager.getRepository(RunnerVerification).save(
          manager.getRepository(RunnerVerification).create({
            runnerProfileId: profile.id,
            verificationType,
            documentS3Key: key,
          }),
        );
        await this.logAccess(manager, row, VerificationDocumentAction.UPLOAD, userId, ip);
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
    return toVerificationView(saved);
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
   * Rows 161, 171 (owner, 2026-10-16): the runner's retention clock is the
   * latest of
   *  (a)/(b) a new or replacement ID or selfie submitted, and (c) any
   *  verification or re-verification started: `createdAt` of every
   *  verification row of the runner;
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
    onlyRunnerProfileIds?: string[],
  ): Promise<{ id: string; runnerProfileId: string }[]> {
    const days = this.retentionDays();
    const params: unknown[] = [now.toISOString(), days, batch];
    if (onlyRunnerProfileIds) {
      params.push(onlyRunnerProfileIds);
    }
    return this.verifications.query(
      `WITH clock AS (${RETENTION_CLOCK_SQL})
       SELECT v.id, v."runnerProfileId" FROM "runner_verifications" v
         JOIN clock c ON c.runner = v."runnerProfileId"
        WHERE v."documentS3Key" IS NOT NULL AND v."purgedAt" IS NULL AND v.status::text <> 'pending'
          AND c.at < $1::timestamptz - make_interval(days => $2::int)
          ${onlyRunnerProfileIds ? 'AND v."runnerProfileId" = ANY($4::uuid[])' : ''}
        ORDER BY v."createdAt" ASC
        LIMIT $3`,
      params,
    );
  }

  /**
   * Row 154/161 purge of the given verifications, each re-checked first
   * (still stored, not pending, clock still past retention). Deletes the
   * image permanently (storage + backups), then keeps only the minimum audit
   * record (row 170): status/outcome, timestamps, reviewer id, `purgedAt`,
   * evidence type and the log ids. The storage key and the reviewer's note
   * are cleared. Logs a `purge` row. A storage failure leaves the row as it
   * is (retried the next day). Callers must apply the open-dispute guard.
   */
  async purgeDocuments(ids: string[], now: Date = new Date()): Promise<string[]> {
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
   * evidence type, optional note <= 500), which restarts the retention clock.
   * It never changes the decision (owner row 181 open). A pending
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
    const note = noteInput?.trim() ? noteInput.trim().slice(0, RE_REVIEW_NOTE_MAX) : null;
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
      list.push({
        id: r.id,
        reviewedBy: r.actorUserId ? { id: r.actorUserId, displayName: names.get(r.actorUserId) ?? null } : null,
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

  async verificationsByUserId(userId: string): Promise<VerificationView[]> {
    const rows = await this.verifications
      .createQueryBuilder('v')
      .innerJoin(RunnerProfile, 'p', 'p.id = v."runnerProfileId" AND p."userId" = :userId', { userId })
      .orderBy('v."createdAt"', 'DESC')
      .getMany();
    return rows.map(toVerificationView);
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
    const profiles = await this.profiles.find({ where: { id: In([...new Set(rows.map((r) => r.runnerProfileId))]) } });
    const byId = new Map(profiles.map((p) => [p.id, p]));
    const users = new Map<string, { id: string; phone: string | null }>();
    for (const p of profiles) {
      const u = await this.users.findById(p.userId);
      users.set(p.id, { id: p.userId, phone: u?.phone ?? null });
    }
    const reReviews = await this.reReviewsOf(rows.map((r) => r.id));
    const names = await this.users.displayNames(rows.map((r) => r.reviewedBy).filter((v): v is string => !!v));
    return {
      items: rows.map((r) => {
        const p = byId.get(r.runnerProfileId);
        return {
          ...toVerificationView(r),
          runnerProfile: p ? { id: p.id, userId: p.userId } : null,
          user: users.get(r.runnerProfileId) ?? null,
          reviewer: r.reviewedBy ? { id: r.reviewedBy, displayName: names.get(r.reviewedBy) ?? null } : null,
          reReviews: reReviews.get(r.id) ?? [],
        };
      }),
      nextCursor,
    };
  }

  async setSkills(userId: string, skillNames: RunnerSkill[]): Promise<RunnerSkill[]> {
    const profile = await this.profileByUserId(userId);
    const unique = [...new Set(skillNames)];
    for (const skill of unique) {
      const exists = await this.skills.findOne({
        where: { runnerProfileId: profile.id, skill },
      });
      if (!exists) {
        await this.skills.save(this.skills.create({ runnerProfileId: profile.id, skill }));
      }
    }
    const rows = await this.skills.find({ where: { runnerProfileId: profile.id } });
    return rows.map((r) => r.skill);
  }

  async setServiceAreas(userId: string, areas: string[]): Promise<string[]> {
    const profile = await this.profileByUserId(userId);
    await this.serviceAreas.delete({ runnerProfileId: profile.id });
    const rows = [...new Set(areas)].filter(Boolean).map((area) =>
      this.serviceAreas.create({ runnerProfileId: profile.id, area }),
    );
    if (rows.length > 0) {
      await this.serviceAreas.save(rows);
    }
    return [...new Set(areas)].filter(Boolean);
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

  /** Admin review of a runner verification submission. */
  async reviewVerification(
    verificationId: string,
    review: { decision: 'approved' | 'rejected'; reviewerNote?: string },
    adminUserId: string,
  ): Promise<VerificationView> {
    const verification = await this.verifications.findOne({
      where: { id: verificationId },
    });
    if (!verification) {
      throw new NotFoundException('Verification not found');
    }
    if (verification.status !== VerificationStatus.PENDING) {
      throw new NotFoundException(
        `Verification already resolved (${verification.status})`,
      );
    }
    verification.status =
      review.decision === 'approved'
        ? VerificationStatus.APPROVED
        : VerificationStatus.REJECTED;
    verification.reviewerNote = review.reviewerNote ?? null;
    verification.reviewedBy = adminUserId;
    verification.reviewedAt = new Date();
    await this.verifications.save(verification);

    if (
      review.decision === 'approved' &&
      verification.verificationType === RunnerVerificationType.GOVERNMENT_ID
    ) {
      const profile = await this.profileById(verification.runnerProfileId);
      if (profile.verificationLevel === VerificationLevel.ONE_BASIC) {
        profile.verificationLevel = VerificationLevel.TWO_ID_VERIFIED;
        await this.profiles.save(profile);
      }
    }
    return toVerificationView(verification);
  }
}

/**
 * Per runner: the latest retention event (rows 161, 171). See
 * `RunnersService.documentsDueForPurge`.
 */
const RETENTION_CLOCK_SQL = `
  SELECT v."runnerProfileId" AS runner,
         GREATEST(
           MAX(v."createdAt"),
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