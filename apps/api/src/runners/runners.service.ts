import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  RunnerAvailability,
  RunnerSkill,
  RunnerVerificationType,
  VerificationLevel,
} from '../common/enums';
import { RunnerProfile } from './runner-profile.entity';
import { RunnerServiceArea, RunnerSkillEntity } from './runner-skill.entity';
import { RunnerVerification } from './runner-verification.entity';

export interface PublicRunnerProfile {
  id: string;
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
    const [skills, serviceAreas] = await Promise.all([
      this.skills.find({ where: { runnerProfileId: profile.id } }),
      this.serviceAreas.find({ where: { runnerProfileId: profile.id } }),
    ]);
    return {
      id: profile.id,
      verificationLevel: profile.verificationLevel,
      avgRating: profile.avgRating,
      errandsCompleted: profile.errandsCompleted,
      availability: profile.availability,
      skills: skills.map((s) => s.skill),
      serviceAreas: serviceAreas.map((a) => a.area),
    };
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
}