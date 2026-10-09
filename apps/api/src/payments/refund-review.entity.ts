import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Why a refund review was opened. */
export enum RefundTrigger {
  /** Customer rejected a price change and the task was cancelled. */
  PRICE_CHANGE_REJECTED = 'price_change_rejected',
  /** Admin resolved a dispute in the customer's favour (DISPUTED -> CANCELLED). */
  DISPUTE_CUSTOMER_FAVOURABLE = 'dispute_customer_favourable',
  /** Any other cancellation after the customer had paid. */
  CANCELLED_AFTER_PAYMENT = 'cancelled_after_payment',
}

/**
 * pending_review → approved (amount > 0, manual payout due) → refunded
 * pending_review → no_refund (amount 0, closed)
 */
export enum RefundStatus {
  PENDING_REVIEW = 'pending_review',
  APPROVED = 'approved',
  NO_REFUND = 'no_refund',
  REFUNDED = 'refunded',
}

/**
 * Admin refund review for a task cancelled after the customer paid (owner
 * decision, BOARD row 37). An admin sets the amount, 0 up to everything the
 * customer paid through STK. Money goes back manually for now: there is no
 * M-Pesa reversal/B2C integration, so `refunded` only records that an admin
 * paid it out and the M-Pesa receipt they used.
 */
@Entity('refund_reviews')
export class RefundReview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  errandId: string;

  @Column({ type: 'enum', enum: RefundTrigger, enumName: 'refund_trigger_enum' })
  trigger: RefundTrigger;

  /** Sum of completed STK legs for the errand when the review opened/updated. */
  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amountPaid: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  refundAmount: string | null;

  @Index()
  @Column({
    type: 'enum',
    enum: RefundStatus,
    enumName: 'refund_status_enum',
    default: RefundStatus.PENDING_REVIEW,
  })
  status: RefundStatus;

  @Column({ type: 'text', nullable: true })
  decisionNote: string | null;

  @Column({ type: 'uuid', nullable: true })
  decidedByUserId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  /** M-Pesa receipt of the manual refund payout. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  payoutReference: string | null;

  @Column({ type: 'uuid', nullable: true })
  paidByUserId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
