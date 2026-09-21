import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PaymentMethodType } from '../common/enums';

@Entity('payment_methods')
export class PaymentMethod {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  customerProfileId: string;

  @Column({
    type: 'enum',
    enum: PaymentMethodType,
    enumName: 'payment_method_type_enum',
  })
  type: PaymentMethodType;

  /** Display label, e.g. "M-Pesa" or "Visa •••• 4242". */
  @Column({ type: 'varchar', length: 100 })
  label: string;

  /** Masked detail shown to the customer, e.g. "+2547•• •••••". */
  @Column({ type: 'varchar', length: 100 })
  detail: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phoneNumber: string | null;

  @Column({ type: 'boolean', default: false })
  isDefault: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}