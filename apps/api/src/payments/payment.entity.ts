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

  @Index(['status', 'createdAt'])
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}