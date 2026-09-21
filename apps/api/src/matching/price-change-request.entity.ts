import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PriceChangeStatus } from '../common/enums';

@Entity('price_change_requests')
export class PriceChangeRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  errandId: string;

  /** Runner (user id) who requested the price change. */
  @Index()
  @Column({ type: 'uuid' })
  requestedByUserId: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  fromPrice: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  toPrice: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reason: string | null;

  @Column({
    type: 'enum',
    enum: PriceChangeStatus,
    enumName: 'price_change_status_enum',
    default: PriceChangeStatus.REQUESTED,
  })
  status: PriceChangeStatus;

  @Column({ type: 'uuid', nullable: true })
  decidedByUserId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}