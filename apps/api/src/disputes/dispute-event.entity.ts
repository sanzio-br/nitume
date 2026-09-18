import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { DisputeEventType } from '../common/enums';

@Entity('dispute_events')
export class DisputeEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  disputeId: string;

  @Column({ type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({
    type: 'enum',
    enum: DisputeEventType,
    enumName: 'dispute_event_type_enum',
  })
  eventType: DisputeEventType;

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}