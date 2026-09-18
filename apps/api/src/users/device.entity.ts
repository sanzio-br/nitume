import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { DevicePlatform } from '../common/enums';

@Entity('devices')
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'enum', enum: DevicePlatform, enumName: 'device_platform_enum' })
  platform: DevicePlatform;

  @Column({ type: 'varchar', length: 255, nullable: true })
  pushToken: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastSeenAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}