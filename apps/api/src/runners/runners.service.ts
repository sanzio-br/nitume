import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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

@Injectable()
export class RunnersService {
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

  async profileById(id: string): Promise<RunnerProfile> {
    const profile = await this.profiles.findOne({ where: { id } });
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

  async addVerification(
    userId: string,
    verificationType: RunnerVerificationType,
    documentS3Key?: string | null,
  ): Promise<RunnerVerification> {
    const profile = await this.profileByUserId(userId);
    return this.verifications.save(
      this.verifications.create({
        runnerProfileId: profile.id,
        verificationType,
        documentS3Key: documentS3Key ?? null,
      }),
    );
  }

  verificationsByUserId(userId: string): Promise<RunnerVerification[]> {
    return this.verifications
      .createQueryBuilder('v')
      .innerJoin(RunnerProfile, 'p', 'p.id = v."runnerProfileId" AND p."userId" = :userId', { userId })
      .orderBy('v."createdAt"', 'DESC')
      .getMany();
  }

  async listVerificationsForAdmin(opts: {
    limit?: number;
    cursor?: string | null;
    status?: VerificationStatus | null;
  } = {}): Promise<{ items: RunnerVerification[]; nextCursor: string | null }> {
    const { limit = 50, cursor, status } = opts;
    const qb = this.verifications
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.runnerProfile', 'p')
      .leftJoinAndSelect('p.user', 'u')
      .orderBy('v."createdAt"', 'DESC')
      .limit(limit + 1);
    if (status) {
      qb.andWhere('v.status = :status', { status });
    }
    if (cursor) {
      const [createdAt, id] = Buffer.from(cursor, 'base64').toString('utf-8').split('::');
      qb.andWhere('(v."createdAt", v.id) < (:createdAt, :id)', { createdAt, id });
    }
    const rows = await qb.getMany();
    let nextCursor: string | null = null;
    if (rows.length > limit) {
      const next = rows.pop()!;
      nextCursor = Buffer.from(`${next.createdAt.toISOString()}::${next.id}`, 'utf-8').toString('base64');
    }
    return { items: rows, nextCursor };
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
  ): Promise<RunnerVerification> {
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
    return verification;
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