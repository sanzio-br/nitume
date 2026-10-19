import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { AssignmentDeclineReason, AssignmentStatus } from '../common/enums';

@Entity('errand_assignments')
export class ErrandAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  errandId: string;

  @Index()
  @Column({ type: 'uuid' })
  runnerProfileId: string;

  @Column({
    type: 'enum',
    enum: AssignmentStatus,
    enumName: 'errand_assignment_status_enum',
    default: AssignmentStatus.OFFERED,
  })
  status: AssignmentStatus;

  @Column({ type: 'timestamptz', nullable: true })
  offerExpiresAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  /** Why the runner declined (rows 108, 210); null unless `declined` with a reason. */
  @Column({
    type: 'enum',
    enum: AssignmentDeclineReason,
    enumName: 'errand_assignment_decline_reason_enum',
    nullable: true,
  })
  declineReason: AssignmentDeclineReason | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}