import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  RunnerAvailability,
  VerificationLevel,
} from '../common/enums';

@Entity('runner_profiles')
export class RunnerProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  userId: string;

  @Column({
    type: 'enum',
    enum: VerificationLevel,
    enumName: 'runner_verification_level_enum',
    default: VerificationLevel.ONE_BASIC,
  })
  verificationLevel: VerificationLevel;

  @Column({ type: 'numeric', precision: 10, scale: 4, default: 0 })
  trustScore: string;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  completionRate: string;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  onTimeRate: string;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  cancellationRate: string;

  @Column({ type: 'numeric', precision: 3, scale: 2, default: 0 })
  avgRating: string;

  @Column({ type: 'int', default: 0 })
  errandsCompleted: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 3000 })
  maxPurchaseAdvance: string;

  @Column({
    type: 'enum',
    enum: RunnerAvailability,
    enumName: 'runner_availability_enum',
    default: RunnerAvailability.OFFLINE,
  })
  availability: RunnerAvailability;

  @Index({ spatial: true })
  @Column({ type: 'geography', spatialFeatureType: 'Point', srid: 4326, nullable: true })
  currentLocation: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastPingAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}