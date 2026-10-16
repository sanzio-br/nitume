import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum VerificationDocumentAction {
  UPLOAD = 'upload',
  VIEW = 'view',
  PURGE = 'purge',
  /** Admin "Re-review evidence" on a decided verification (rows 161 (d), 171); restarts the retention clock. */
  RE_REVIEW = 're_review',
}

/**
 * Append-only log of every access to a runner ID or selfie image (owner
 * answers rows 144, 154, 171): uploads, admin views (a signed URL was
 * issued), admin re-reviews of the evidence and the retention purge. DB triggers reject UPDATE, DELETE and TRUNCATE.
 */
@Entity('verification_document_access_log')
@Index('IDX_verification_document_access_log_verification', ['verificationId', 'createdAt'])
@Index('IDX_verification_document_access_log_actor', ['actorUserId', 'createdAt'])
export class VerificationDocumentAccessLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  verificationId: string;

  @Column({ type: 'uuid' })
  runnerProfileId: string;

  /** Runner (upload) or admin (view); null for the system purge. */
  @Column({ type: 'uuid', nullable: true })
  actorUserId: string | null;

  @Column({
    type: 'enum',
    enum: VerificationDocumentAction,
    enumName: 'verification_document_access_action_enum',
  })
  action: VerificationDocumentAction;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  /** Optional admin note on a `re_review` (<= 500); cleared by the purge (row 170). */
  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
