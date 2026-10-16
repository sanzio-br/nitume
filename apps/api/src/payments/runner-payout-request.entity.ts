import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RunnerProfile } from '../runners/runner-profile.entity';

/** Lifecycle of a runner payout request (rows 117, 153): requested -> paid | rejected. */
export enum RunnerPayoutRequestStatus {
  REQUESTED = 'requested',
  PAID = 'paid',
  REJECTED = 'rejected',
}

/**
 * A runner's request to be paid out (owner answers rows 117, 146, 153;
 * RA-15, N-17). Not a wallet: the money owed is always the runner's payable
 * ledger lines; a request only asks ops to pay some of them. Ops pay whole
 * lines, so `paidAmount` can be below `requestedAmount`; the request still
 * closes `paid` and the difference stays available for a new request.
 * Rows are never deleted; final once `paid` or `rejected` (DB trigger).
 */
@Entity('runner_payout_requests')
@Index('IDX_runner_payout_requests_runner', ['runnerProfileId', 'createdAt'])
@Index('IDX_runner_payout_requests_status', ['status', 'createdAt'])
@Index('IDX_runner_payout_requests_one_open', ['runnerProfileId'], {
  unique: true,
  where: `"status" = 'requested'`,
})
export class RunnerPayoutRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  runnerProfileId: string;

  @ManyToOne(() => RunnerProfile, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'runnerProfileId', foreignKeyConstraintName: 'FK_runner_payout_requests_runner' })
  runnerProfile?: RunnerProfile;

  /** What the runner asked for (KES), never changed. */
  @Column({ type: 'numeric', precision: 12, scale: 2 })
  requestedAmount: string;

  /** Total of the lines paid on this request; null until `paid`; at most `requestedAmount`. */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  paidAmount: string | null;

  @Column({
    type: 'enum',
    enum: RunnerPayoutRequestStatus,
    enumName: 'runner_payout_request_status_enum',
    default: RunnerPayoutRequestStatus.REQUESTED,
  })
  status: RunnerPayoutRequestStatus;

  /** The runner's sign-in phone when the request was made (row 118). */
  @Column({ type: 'varchar', length: 20 })
  destinationPhone: string;

  /** M-Pesa receipt of the manual payout (upper-case), set when `paid`. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  payoutReference: string | null;

  @Column({ type: 'uuid', nullable: true })
  decidedByUserId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  /** Rejection reason (shown to the runner), or an optional note on payment. */
  @Column({ type: 'text', nullable: true })
  decisionNote: string | null;

  /** The runner's user id. */
  @Column({ type: 'uuid' })
  createdByUserId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
