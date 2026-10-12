import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { RefundReview } from './refund-review.entity';

/**
 * - `correction`: the recorded payout receipt was wrong or the refund was
 *   paid again under another M-Pesa receipt (`newPayoutReference` required).
 * - `reversal`: the recorded payout was reversed (money returned to Nitume).
 */
export enum RefundPayoutCorrectionKind {
  CORRECTION = 'correction',
  REVERSAL = 'reversal',
}

/**
 * Append-only audit record of a change to a refund's payout after it was
 * recorded (owner answer row 100). The review's own `payoutReference`,
 * `paidAt` and `paidByUserId` stay as first recorded; the effective payout is
 * derived from the latest record (see `effectivePayoutOf`). Rows are never
 * updated or deleted.
 */
@Entity('refund_payout_corrections')
@Index('IDX_refund_payout_corrections_review', ['refundReviewId', 'createdAt'])
export class RefundPayoutCorrection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  refundReviewId: string;

  @ManyToOne(() => RefundReview, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'refundReviewId', foreignKeyConstraintName: 'FK_refund_payout_corrections_review' })
  refundReview?: RefundReview;

  @Column({
    type: 'enum',
    enum: RefundPayoutCorrectionKind,
    enumName: 'refund_payout_correction_kind_enum',
  })
  kind: RefundPayoutCorrectionKind;

  /** The effective payout receipt when this record was made. */
  @Column({ type: 'varchar', length: 64 })
  previousPayoutReference: string;

  /**
   * Correction: the receipt that replaces it. Reversal: the M-Pesa reversal
   * transaction id when the admin has one, else null.
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  newPayoutReference: string | null;

  /**
   * Correction: the amount paid under the new receipt. Reversal: the amount
   * reversed (always the full effective payout). KES.
   */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  amount: string | null;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'uuid' })
  createdByUserId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
