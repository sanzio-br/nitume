import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('quotes')
export class Quote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  errandId: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  baseFee: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  distanceFee: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  timeFee: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  urgencyFee: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  complexityFee: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  premiumFee: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  total: string;

  @Column({ type: 'varchar', length: 8, default: 'KES' })
  currency: string;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}