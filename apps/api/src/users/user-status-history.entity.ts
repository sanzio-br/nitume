import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { StatusHistoryActor, UserStatus } from '../common/enums';

/**
 * Issue #24 (owner WQ-23, 2026-10-28): audit record of an account status
 * change (suspend, ban, reactivate). Append-only (DB triggers reject UPDATE,
 * DELETE, TRUNCATE), kept for the life of the account, written in the same
 * transaction as the `users.status` update. `reason` is internal (10-500
 * characters after trimming) and never shown to the user.
 *
 * Indexes and CHECKs are defined by migration `1790103600000`
 * (`IDX_user_status_history_user_created` is `("userId", "createdAt" DESC)`).
 */
@Entity('user_status_history')
@Index('IDX_user_status_history_user_created', ['userId', 'createdAt'])
@Index('IDX_user_status_history_actor_created', ['actorUserId', 'createdAt'])
export class UserStatusHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'enum', enum: UserStatus, enumName: 'user_status_enum' })
  fromStatus: UserStatus;

  @Column({ type: 'enum', enum: UserStatus, enumName: 'user_status_enum' })
  toStatus: UserStatus;

  @Column({ type: 'enum', enum: StatusHistoryActor, enumName: 'status_history_actor_enum' })
  actorType: StatusHistoryActor;

  /** Null only for a `system` actor. */
  @Column({ type: 'uuid', nullable: true })
  actorUserId: string | null;

  @Column({ type: 'text' })
  reason: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
