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
 * Kinds of payout correction (spec drawer-refund "Corrections", N-15):
 * - `corrected`: effective payout sent; receipt and/or amount replaced
 *   (a partial reversal is a `corrected` record with the lower amount);
 * - `reversed`: effective payout sent; the M-Pesa payment was reversed and
 *   the money came back (`newReference` = the reversal's M-Pesa code);
 * - `resent`: effective payout reversed; the refund was sent again.
 */
export enum RefundPayoutCorrectionKind {
  CORRECTED = 'corrected',
  REVERSED = 'reversed',
  RESENT = 'resent',
}

/**
 * Append-only audit record of a change to a refund's payout after it was
 * recorded (owner answer row 100, system design §2.2). The review's own
 * `payoutReference`, `paidAt` and `paidByUserId` stay as first recorded;
 * the effective payout is the original with these records applied in order
 * (see `effectivePayoutOf`). No update or delete path exists in code and a
 * database trigger rejects UPDATE/DELETE.
 */
@Entity('refund_payout_corrections')
@Index('IDX_refund_payout_corrections_review', ['refundReviewId', 'createdAt'])
export class RefundPayoutCorrection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  refundReviewId: string;

  @ManyToOne(() => RefundReview, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'refundReviewId',
    foreignKeyConstraintName: 'FK_refund_payout_corrections_review',
  })
  refundReview?: RefundReview;

  @Column({
    type: 'enum',
    enum: RefundPayoutCorrectionKind,
    enumName: 'refund_payout_correction_kind_enum',
  })
  kind: RefundPayoutCorrectionKind;

  /** Effective receipt before this record (null after a reversal). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  previousReference: string | null;

  /** Effective amount sent before this record ("0.00" after a reversal). */
  @Column({ type: 'numeric', precision: 12, scale: 2 })
  previousAmount: string;

  /** Corrected receipt, reversal M-Pesa code, or re-sent receipt; upper-case. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  newReference: string | null;

  /** Amount actually sent, when it changes (`corrected`) or on `resent`. */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  newAmount: string | null;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'uuid' })
  createdByUserId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
