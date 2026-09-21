import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EvidenceType, GeoPoint } from '../common/enums';

@Entity('evidence')
export class Evidence {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index(['errandId', 'type'])
  @Column({ type: 'uuid' })
  errandId: string;

  @Column({
    type: 'enum',
    enum: EvidenceType,
    enumName: 'evidence_type_enum',
  })
  type: EvidenceType;

  @Column({ type: 'varchar', length: 255 })
  s3Key: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  url: string | null;

  @Column({ type: 'geography', spatialFeatureType: 'Point', srid: 4326, nullable: true })
  capturedAtLocation: GeoPoint | null;

  @Column({ type: 'timestamptz' })
  capturedAt: Date;

  @Column({ type: 'uuid', nullable: true })
  uploadedBy: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}