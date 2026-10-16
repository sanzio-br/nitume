import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import {
  RunnerVerificationType,
  VerificationStatus,
} from '../common/enums';

@Entity('runner_verifications')
export class RunnerVerification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  runnerProfileId: string;

  @Column({
    type: 'enum',
    enum: RunnerVerificationType,
    enumName: 'runner_verification_type_enum',
  })
  verificationType: RunnerVerificationType;

  @Column({
    type: 'enum',
    enum: VerificationStatus,
    enumName: 'verification_status_enum',
    default: VerificationStatus.PENDING,
  })
  status: VerificationStatus;

  /**
   * Storage key of the uploaded image (restricted storage, rows 125, 154).
   * Never returned to clients; nulled when the image is purged.
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  documentS3Key: string | null;

  /** When the retention purge deleted the image (row 154); null while kept. */
  @Column({ type: 'timestamptz', nullable: true })
  purgedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  reviewerNote: string | null;

  @Column({ type: 'uuid', nullable: true })
  reviewedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}