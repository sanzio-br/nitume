import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { OtpChannel } from '../common/enums';

/**
 * Append-only OTP registry. Every issued code is persisted (audit trail):
 * requests write a hashed code; verification marks it consumed (single-use).
 * Cooldown and rate-limit state are derived from the stored rows, so no
 * external store such as Redis is required for OTP flows.
 */
@Entity('otp_codes')
@Index(['channel', 'target'])
export class OtpCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Which channel the code was issued to (phone or email). */
  @Column({
    type: 'enum',
    enum: OtpChannel,
    enumName: 'otp_channel_enum',
  })
  channel: OtpChannel;

  /** Normalized target: +2547… phone or lowercased email. */
  @Column({ type: 'varchar', length: 320 })
  target: string;

  /** SHA-256 of the raw code. The plaintext is never stored. */
  @Column({ type: 'varchar', length: 64 })
  codeHash: string;

  /** Running count of failed verification attempts against this code. */
  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  /** Until when a new code may not be requested (resend cooldown). */
  @Column({ type: 'timestamptz', nullable: true })
  resendLockUntil: Date | null;

  /** Set on successful verification — codes are single-use. */
  @Column({ type: 'timestamptz', nullable: true })
  consumedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}