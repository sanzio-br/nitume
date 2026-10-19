import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { RunnerSkill } from '../common/enums';

/** One row per runner and skill (unique since migration 1790103100000, row 115). */
@Entity('runner_skills')
@Index('UQ_runner_skills_profile_skill', ['runnerProfileId', 'skill'], { unique: true })
export class RunnerSkillEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  runnerProfileId: string;

  @Column({
    type: 'enum',
    enum: RunnerSkill,
    enumName: 'runner_skill_enum',
  })
  skill: RunnerSkill;

  @Column({ type: 'boolean', default: false })
  verified: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

@Entity('runner_service_areas')
export class RunnerServiceArea {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  runnerProfileId: string;

  @Column({ type: 'varchar', length: 64 })
  area: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}