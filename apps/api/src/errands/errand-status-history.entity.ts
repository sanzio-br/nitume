import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { ErrandStatus, StatusHistoryActor } from '../common/enums';

@Entity('errand_status_history')
export class ErrandStatusHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  errandId: string;

  @Column({
    type: 'enum',
    enum: ErrandStatus,
    enumName: 'errand_status_enum',
    nullable: true,
  })
  fromStatus: ErrandStatus | null;

  @Column({
    type: 'enum',
    enum: ErrandStatus,
    enumName: 'errand_status_enum',
  })
  toStatus: ErrandStatus;

  @Column({
    type: 'enum',
    enum: StatusHistoryActor,
    enumName: 'status_history_actor_enum',
  })
  actorType: StatusHistoryActor;

  @Column({ type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note: string | null;

  @Index(['errandId', 'createdAt'])
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}