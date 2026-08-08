import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MotoStatus } from '../../constants';
import { DATABASE_SCHEMA } from '../constants';
import { FuelRecordEntity } from './fuel-record.entity';
import { UserEntity } from './user.entity';

@Index('idx_motos_owner_status_updated', ['ownerId', 'status', 'updatedAt'])
@Entity({ name: 'motos', schema: DATABASE_SCHEMA })
export class MotoEntity {
  @PrimaryGeneratedColumn('identity')
  id!: number;

  @Column({ name: 'owner_id' })
  ownerId!: number;

  @Column({ name: 'moto_name', length: 100 })
  motoName!: string;

  @Column({ name: 'moto_buy_date', type: 'date' })
  motoBuyDate!: string;

  @Column({ name: 'moto_license_plate', length: 50 })
  motoLicensePlate!: string;

  @Column({ name: 'moto_photo_url', length: 1000 })
  motoPhotoUrl!: string;

  @Column({ default: MotoStatus.ACTIVE, length: 32, type: 'varchar' })
  status!: MotoStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => UserEntity, 'motos', {
    createForeignKeyConstraints: false,
    nullable: false,
  })
  @JoinColumn({ name: 'owner_id' })
  owner?: UserEntity;

  @OneToMany(() => FuelRecordEntity, 'moto')
  fuelRecords?: FuelRecordEntity[];
}
