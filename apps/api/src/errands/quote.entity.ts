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

  /**
   * Every quote the API writes has an expiry (row 83, default 24h); legacy
   * nulls are backfilled to createdAt + 24h by migration 1790100800000.
   * The column stays nullable (no schema change).
   */
  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  /**
   * When the customer accepted this quote (QUOTED -> ACCEPTED, or the
   * explicit accept of an admin re-quote on an ACCEPTED errand, row 72).
   * Payment is only taken against the newest quote once it is accepted.
   */
  @Column({ type: 'timestamptz', nullable: true })
  acceptedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}