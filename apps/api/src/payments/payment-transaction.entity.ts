import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PaymentTransactionStatus } from '../common/enums';

@Entity('payment_transactions')
export class PaymentTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  paymentId: string;

  @Column({ type: 'uuid' })
  paymentTypeId: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  mpesaReference: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount: string;

  @Column({
    type: 'enum',
    enum: PaymentTransactionStatus,
    enumName: 'payment_transaction_status_enum',
    default: PaymentTransactionStatus.INITIATED,
  })
  status: PaymentTransactionStatus;

  @Column({ type: 'jsonb', nullable: true })
  rawCallback: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}