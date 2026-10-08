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

  /**
   * Human-readable, backend-generated reference (`NT-10001`, `NT-10002`, …)
   * from the `errand_reference_seq` sequence. Never set by clients.
   */
  @Column({
    type: 'varchar',
    length: 16,
    unique: true,
    default: () => `('NT-' || nextval('errand_reference_seq'))`,
    update: false,
  })
  reference: string;

  /** Optional customer-provided short title (editable by the owner). */
  @Column({ type: 'varchar', length: 120, nullable: true })
  title: string | null;

  @Column({
    type: 'enum',
    enum: ErrandCategory,
    enumName: 'errand_category_enum',
  })
  category: ErrandCategory;

  @Column({ type: 'text' })
  description: string;

  /** Notes written by the assigned runner, shown on evidence review. */
  @Column({ type: 'text', nullable: true })
  runnerNotes: string | null;

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

  /**
   * Merchant Till/Paybill details for the merchant_direct route, supplied by
   * the merchant or an admin (rows 42-44). Either a Till or a Paybill number;
   * the account reference only goes with a Paybill.
   */
  @Column({ type: 'varchar', length: 120, nullable: true })
  merchantName: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  merchantTillNumber: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  merchantPaybillNumber: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  merchantAccountReference: string | null;

  @VersionColumn({ type: 'int', default: 1 })
  version: number;

  @Index(['status', 'category', 'createdAt'])
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}