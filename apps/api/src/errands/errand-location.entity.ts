import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { ErrandPointType, GeoPoint } from '../common/enums';

@Entity('errand_locations')
export class ErrandLocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  errandId: string;

  @Column({
    type: 'enum',
    enum: ErrandPointType,
    enumName: 'errand_point_type_enum',
  })
  pointType: ErrandPointType;

  @Index({ spatial: true })
  @Column({ type: 'geography', spatialFeatureType: 'Point', srid: 4326 })
  coordinates: GeoPoint;

  @Column({ type: 'varchar', length: 500 })
  addressText: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  placeId: string | null;
}