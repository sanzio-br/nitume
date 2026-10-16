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
import { Errand } from '../errands/errand.entity';
import { Evidence } from '../evidence/evidence.entity';
import { RunnerProfile } from '../runners/runner-profile.entity';

/**
 * Kind of line on the runner payout ledger (owner answer row 107).
 *
 * Obligations (what Nitume owes the runner, one per errand and type):
 * - `runner_fee`: the runner fee the customer paid, created at CONFIRMED;
 * - `item_reimbursement`: the item amount the runner bought on
 *   `send_to_runner`, created at CONFIRMED (rows 95, 104) or claimed by the
 *   runner after CANCELLED/FAILED (row 106). Never part of the runner fee.
 *
 * Adjustments of a paid obligation (`relatedLineId` = the obligation),
 * mirroring the refund payout corrections (row 100):
 * - `correction`: the payout was sent; receipt and/or amount corrected;
 * - `reversal`: the payout was reversed (`payoutReference` = reversal code);
 *   the obligation is owed again;
 * - `resend`: a reversed payout was sent again.
 */
export enum RunnerPayoutLineType {
  RUNNER_FEE = 'runner_fee',
  ITEM_REIMBURSEMENT = 'item_reimbursement',
  CORRECTION = 'correction',
  REVERSAL = 'reversal',
  RESENT_PAYOUT = 'resent_payout',
}

export const OBLIGATION_LINE_TYPES: readonly RunnerPayoutLineType[] = [
  RunnerPayoutLineType.RUNNER_FEE,
  RunnerPayoutLineType.ITEM_REIMBURSEMENT,
];

export const ADJUSTMENT_LINE_TYPES: readonly RunnerPayoutLineType[] = [
  RunnerPayoutLineType.CORRECTION,
  RunnerPayoutLineType.REVERSAL,
  RunnerPayoutLineType.RESENT_PAYOUT,
];

/**
 * Stored status of a line. Obligations: `on_hold` (ops review, rows
 * 105, 106) -> `payable` | `rejected`; `payable` -> `paid` (manual M-Pesa
 * payout recorded); an unpaid item line may go back `payable` ->
 * `on_hold` when ops flag a receipt mismatch. `paid` and `rejected`
 * are final. Adjustments are always `recorded`.
 */
export enum RunnerPayoutLineStatus {
  ON_HOLD = 'on_hold',
  PAYABLE = 'payable',
  PAID = 'paid',
  REJECTED = 'rejected',
  RECORDED = 'recorded',
}

/** Why an item reimbursement waits for ops review (rows 105, 106, 108). */
export enum RunnerPayoutReviewReason {
  /** No receipt from the runner on file at CONFIRMED (row 105). */
  RECEIPT_MISSING = 'receipt_missing',
  /** Ops flagged the receipt as not matching the purchase (row 105). */
  RECEIPT_MISMATCH = 'receipt_mismatch',
  /** Runner's claim after the task ended CANCELLED or FAILED (row 106). */
  OUT_OF_POCKET_CLAIM = 'out_of_pocket_claim',
  /** The purchase is above the runner's max_purchase_advance (row 108). */
  OVER_PURCHASE_LIMIT = 'over_purchase_limit',
  /**
   * A price-decrease refund review on the task was still undecided at
   * CONFIRMED: the item amount owed may still drop.
   */
  PRICE_DECREASE_PENDING = 'price_decrease_pending',
}

/**
 * Runner payout ledger (owner answer row 107, system design §2.2/§6). One row
 * per financial line; the runner's balance is always derived from the lines,
 * never stored (no wallet, no escrow).
 *
 * Rows are never deleted (a trigger rejects DELETE and TRUNCATE). An
 * obligation's financial identity (runner, errand, type, requested amount,
 * cap, receipt, creator, creation time) never changes; the trigger only lets
 * its lifecycle move forward (review decision, payout recorded) and freezes
 * it once `paid` or `rejected`. After that, changes are new adjustment rows,
 * which can never be updated.
 */
@Entity('runner_payout_lines')
@Index('IDX_runner_payout_lines_obligation', ['errandId', 'kind'], {
  unique: true,
  where: `"kind" IN ('runner_fee', 'item_reimbursement')`,
})
@Index('IDX_runner_payout_lines_runner', ['runnerProfileId', 'createdAt'])
@Index('IDX_runner_payout_lines_status', ['status', 'createdAt'])
@Index('IDX_runner_payout_lines_related', ['relatedLineId', 'createdAt'])
export class RunnerPayoutLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  runnerProfileId: string;

  @ManyToOne(() => RunnerProfile, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'runnerProfileId', foreignKeyConstraintName: 'FK_runner_payout_lines_runner' })
  runnerProfile?: RunnerProfile;

  @Column({ type: 'uuid' })
  errandId: string;

  @ManyToOne(() => Errand, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'errandId', foreignKeyConstraintName: 'FK_runner_payout_lines_errand' })
  errand?: Errand;

  @Column({ type: 'enum', enum: RunnerPayoutLineType, enumName: 'runner_payout_line_type_enum' })
  kind: RunnerPayoutLineType;

  @Column({ type: 'enum', enum: RunnerPayoutLineStatus, enumName: 'runner_payout_line_status_enum' })
  status: RunnerPayoutLineStatus;

  /**
   * Obligations: what the system computed (CONFIRMED) or the runner claimed
   * (row 106), KES. Null on adjustments.
   */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  requestedAmount: string | null;

  /**
   * Obligations: the payable amount (null while `on_hold` or after
   * `rejected`). Adjustments: the new amount sent (`correction` when it
   * changes, `resend`), else null.
   */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  amount: string | null;

  /**
   * Item reimbursements: the item amount actually paid to Nitume for the
   * task when the line was created (rows 105, 106 cap). Null otherwise.
   */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  capAmount: string | null;

  /**
   * Item reimbursements: the runner's max_purchase_advance in force when the
   * obligation was created (CONFIRMED or claim; owner answer row 152). The
   * ordinary approval ceiling uses it, never a later limit. Null on lines
   * created before row 152 (the runner's current limit applies) and on
   * other kinds.
   */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  purchaseLimitAtCreation: string | null;

  @Column({
    type: 'enum',
    enum: RunnerPayoutReviewReason,
    enumName: 'runner_payout_review_reason_enum',
    nullable: true,
  })
  reviewReason: RunnerPayoutReviewReason | null;

  /** Receipt (evidence.type = receipt) the item line relies on, if any. */
  @Column({ type: 'uuid', nullable: true })
  receiptEvidenceId: string | null;

  @ManyToOne(() => Evidence, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'receiptEvidenceId', foreignKeyConstraintName: 'FK_runner_payout_lines_receipt' })
  receiptEvidence?: Evidence;

  /**
   * Obligations paid on a runner payout request (rows 117, 153): the
   * request; set only when the line is marked paid. Null otherwise.
   */
  @Column({ type: 'uuid', nullable: true })
  payoutRequestId: string | null;

  /** Adjustments: the obligation they change. Null on obligations. */
  @Column({ type: 'uuid', nullable: true })
  relatedLineId: string | null;

  @ManyToOne(() => RunnerPayoutLine, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'relatedLineId', foreignKeyConstraintName: 'FK_runner_payout_lines_related' })
  relatedLine?: RunnerPayoutLine;

  /** Adjustments: effective receipt before this record (null after a reversal). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  previousReference: string | null;

  /** Adjustments: effective amount sent before this record ("0.00" after a reversal). */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  previousAmount: string | null;

  /**
   * Obligations: M-Pesa receipt of the manual payout, set once when `paid`.
   * Adjustments: corrected receipt, reversal code or re-sent receipt.
   * Stored upper-case.
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  payoutReference: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  paidByUserId: string | null;

  /** Runner's claim note, system note, or the required reason of an adjustment. */
  @Column({ type: 'text', nullable: true })
  note: string | null;

  /** Ops review decision note (admin only). */
  @Column({ type: 'text', nullable: true })
  decisionNote: string | null;

  @Column({ type: 'uuid', nullable: true })
  decidedByUserId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  /** Admin or runner who created the line; null when created by the system. */
  @Column({ type: 'uuid', nullable: true })
  createdByUserId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
