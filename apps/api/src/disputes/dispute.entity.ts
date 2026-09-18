import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DisputeStatus } from '../common/enums';

@Entity('disputes')
export class Dispute {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  errandId: string;

  @Column({ type: 'uuid' })
  openedBy: string;

  @Column({ type: 'varchar', length: 500 })
  reason: string;

  @Column({
    type: 'enum',
    enum: DisputeStatus,
    enumName: 'dispute_status_enum',
    default: DisputeStatus.OPEN,
  })
  status: DisputeStatus;

  @Column({ type: 'text', nullable: true })
  resolution: string | null;

  @Column({ type: 'uuid', nullable: true })
  resolvedBy: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}