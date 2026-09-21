import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { GeoPoint } from '../common/enums';

@Entity('runner_locations')
export class RunnerLocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  runnerProfileId: string;

  @Column({ type: 'uuid', nullable: true })
  errandId: string | null;

  @Index({ spatial: true })
  @Column({ type: 'geography', spatialFeatureType: 'Point', srid: 4326 })
  coordinates: GeoPoint;

  @Column({ type: 'timestamptz' })
  capturedAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}