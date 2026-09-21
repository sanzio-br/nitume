import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import {
  ErrandCategory,
  ErrandStatus,
  ErrandUrgency,
} from '../common/enums';

@Entity('errands')
export class Errand {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  customerId: string;

  @Column({
    type: 'enum',
    enum: ErrandCategory,
    enumName: 'errand_category_enum',
  })
  category: ErrandCategory;

  @Column({ type: 'text' })
  description: string;

  @Column({
    type: 'enum',
    enum: ErrandStatus,
    enumName: 'errand_status_enum',
    default: ErrandStatus.DRAFT,
  })
  status: ErrandStatus;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  budget: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  quotedPrice: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  finalPrice: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  deadlineAt: Date | null;

  @Column({
    type: 'enum',
    enum: ErrandUrgency,
    enumName: 'errand_urgency_enum',
    default: ErrandUrgency.STANDARD,
  })
  urgency: ErrandUrgency;

  @VersionColumn({ type: 'int', default: 1 })
  version: number;

  @Index(['status', 'category', 'createdAt'])
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}