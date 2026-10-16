import { HttpStatus, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiError } from '../common/api-error';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, IsNull, Repository } from 'typeorm';
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
import { documentTooLarge, idMaxUploadBytes } from './upload/verification-upload';
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
export type AdminVerificationView = VerificationView & {
  runnerProfile: { id: string; userId: string } | null;
  user: { id: string; phone: string | null } | null;
};

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
   * 400 verification_type_not_uploadable, verification_document_type_invalid,
   * verification_document_empty.
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
    if (!DOCUMENT_CONTENT_TYPES.includes(file.mimetype)) {
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
    const saved = await this.verifications.manager.transaction(async (manager) => {
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
   * Row 154 retention: deletes the stored ID/selfie images of runners whose
   * last relevant verification/activity event is older than the retention
   * period (`runnerVerification.retentionDays`, default 365). Events counted,
   * per runner: any verification submitted or decided; any task assignment
   * (offer) made to the runner; any dispute opened or updated on a task the
   * runner was assigned to. Never purged: a verification still pending, or
   * any runner with an open / under-review dispute. Each purge deletes the
   * object, nulls the key, records purgedAt and logs a `purge` access row.
   * A storage failure leaves the row as it is (retried the next day).
   */
  async purgeExpiredDocuments(now: Date = new Date(), batch = 200): Promise<string[]> {
    const days = this.config?.get<number>('runnerVerification.retentionDays', 365) ?? 365;
    const due: { id: string }[] = await this.verifications.query(
      `WITH last_event AS (
         SELECT rp.id AS runner,
                GREATEST(
                  (SELECT MAX(GREATEST(v."createdAt", COALESCE(v."reviewedAt", v."createdAt")))
                     FROM "runner_verifications" v WHERE v."runnerProfileId" = rp.id),
                  (SELECT MAX(a."createdAt") FROM "errand_assignments" a WHERE a."runnerProfileId" = rp.id),
                  (SELECT MAX(GREATEST(d."createdAt", d."updatedAt"))
                     FROM "disputes" d JOIN "errand_assignments" a ON a."errandId" = d."errandId"
                    WHERE a."runnerProfileId" = rp.id)
                ) AS at
           FROM "runner_profiles" rp
       )
       SELECT v.id FROM "runner_verifications" v
         JOIN last_event le ON le.runner = v."runnerProfileId"
        WHERE v."documentS3Key" IS NOT NULL AND v."purgedAt" IS NULL AND v.status <> 'pending'
          AND le.at < $1::timestamptz - make_interval(days => $2::int)
          AND NOT EXISTS (
            SELECT 1 FROM "disputes" d JOIN "errand_assignments" a ON a."errandId" = d."errandId"
             WHERE a."runnerProfileId" = v."runnerProfileId" AND d.status IN ('open', 'under_review'))
        ORDER BY v."createdAt" ASC
        LIMIT $3`,
      [now.toISOString(), days, batch],
    );
    const purged: string[] = [];
    for (const { id } of due) {
      const row = await this.verifications.findOne({ where: { id } });
      if (!row?.documentS3Key || row.purgedAt) {
        continue;
      }
      try {
        await this.documents.destroy(row.documentS3Key);
      } catch (err) {
        this.logger.error(
          `Could not delete verification image ${row.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
        continue;
      }
      await this.verifications.manager.transaction(async (manager) => {
        const result = await manager
          .getRepository(RunnerVerification)
          .update({ id: row.id, purgedAt: IsNull() }, { documentS3Key: null, purgedAt: now });
        if (result.affected) {
          await this.logAccess(manager, row, VerificationDocumentAction.PURGE, null, null);
          purged.push(row.id);
        }
      });
    }
    return purged;
  }

  private async logAccess(
    manager: EntityManager,
    verification: Pick<RunnerVerification, 'id' | 'runnerProfileId'>,
    action: VerificationDocumentAction,
    actorUserId: string | null,
    ip: string | null,
  ): Promise<void> {
    const repo = manager.getRepository(VerificationDocumentAccessLog);
    await repo.save(
      repo.create({
        verificationId: verification.id,
        runnerProfileId: verification.runnerProfileId,
        actorUserId,
        action,
        ip: ip ? ip.slice(0, 64) : null,
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
    return {
      items: rows.map((r) => {
        const p = byId.get(r.runnerProfileId);
        return {
          ...toVerificationView(r),
          runnerProfile: p ? { id: p.id, userId: p.userId } : null,
          user: users.get(r.runnerProfileId) ?? null,
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