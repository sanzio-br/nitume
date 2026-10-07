import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PaymentFlow, PaymentStatus } from '../common/enums';

@Entity('payments')
// One non-failed main payment per errand (concurrent initiate guard).
@Index('IDX_payments_errand_active_primary', ['errandId'], {
  unique: true,
  where: `"status" <> 'failed' AND "priceChangeRequestId" IS NULL`,
})
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  errandId: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  serviceFee: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  runnerFee: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  merchantAmount: string;

  @Column({
    type: 'enum',
    enum: PaymentFlow,
    enumName: 'payment_flow_enum',
  })
  paymentFlow: PaymentFlow;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    enumName: 'payment_status_enum',
    default: PaymentStatus.PENDING,
  })
  status: PaymentStatus;

  /**
   * Client-supplied `Idempotency-Key` of the initiate call that created this
   * payment. A retry with the same key returns this row (no new STK push).
   */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128, nullable: true })
  idempotencyKey: string | null;

  /**
   * Set on the record of a merchant/item price difference approved through
   * a price-change request (no service or runner fee). Null for the main
   * service + runner fee payment.
   */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  priceChangeRequestId: string | null;

  @Index(['status', 'createdAt'])
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}