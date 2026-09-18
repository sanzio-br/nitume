import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { PaymentTypeCode } from '../common/enums';

@Entity('payment_type')
export class PaymentType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({
    type: 'enum',
    enum: PaymentTypeCode,
    enumName: 'payment_type_code_enum',
  })
  code: PaymentTypeCode;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;
}