import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('errand_items')
export class ErrandItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  errandId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ type: 'varchar', length: 32, nullable: true })
  unit: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}