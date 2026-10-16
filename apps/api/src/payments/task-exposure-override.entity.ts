import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Which decision went above the task's combined cap (row 136). */
export enum TaskExposureOverrideSource {
  REFUND_DECISION = 'refund_decision',
  REFUND_CORRECTION = 'refund_correction',
  RUNNER_REIMBURSEMENT = 'runner_reimbursement',
}

/**
 * Audit record of an admin override of a task's combined exposure cap (owner
 * answer row 136): customer refunds + the runner's item reimbursement above
 * what was paid to Nitume. Append-only (DB triggers reject UPDATE, DELETE,
 * TRUNCATE); written in the same transaction as the decision it allows.
 */
@Entity('task_exposure_overrides')
@Index('IDX_task_exposure_overrides_errand', ['errandId', 'createdAt'])
export class TaskExposureOverride {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  errandId: string;

  @Column({ type: 'enum', enum: TaskExposureOverrideSource, enumName: 'task_exposure_override_source_enum' })
  source: TaskExposureOverrideSource;

  @Column({ type: 'uuid', nullable: true })
  refundReviewId: string | null;

  @Column({ type: 'uuid', nullable: true })
  runnerPayoutLineId: string | null;

  /** The amount approved by the override (KES). */
  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount: string;

  /** The most allowed without an override at that moment (`remaining`). */
  @Column({ type: 'numeric', precision: 12, scale: 2 })
  normalCap: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  totalPaidToNitume: string;

  /** Other committed refunds on the task (effective values). */
  @Column({ type: 'numeric', precision: 12, scale: 2 })
  committedRefunds: string;

  /** Other committed runner item reimbursements on the task. */
  @Column({ type: 'numeric', precision: 12, scale: 2 })
  committedReimbursements: string;

  @Column({ type: 'text' })
  note: string;

  @Column({ type: 'uuid' })
  createdByUserId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
