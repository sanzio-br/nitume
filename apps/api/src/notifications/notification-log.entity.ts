import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import {
  NotificationChannel,
  NotificationSendStatus,
} from '../common/enums';

@Entity('notification_log')
export class NotificationLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  errandId: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @Column({
    type: 'enum',
    enum: NotificationChannel,
    enumName: 'notification_channel_enum',
  })
  channel: NotificationChannel;

  @Column({ type: 'varchar', length: 100 })
  eventType: string;

  @Column({
    type: 'enum',
    enum: NotificationSendStatus,
    enumName: 'notification_send_status_enum',
    default: NotificationSendStatus.QUEUED,
  })
  status: NotificationSendStatus;

  @Column({ type: 'jsonb', nullable: true })
  providerResponse: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}