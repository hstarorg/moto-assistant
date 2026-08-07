import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MotoEntity } from './moto.entity';

@Index('idx_fuel_records_moto_date_id', ['motoId', 'refuelDate', 'id'])
@Entity('fuel_records')
export class FuelRecordEntity {
  @PrimaryGeneratedColumn('identity')
  id!: number;

  @Column({ name: 'moto_id' })
  motoId!: number;

  @Column({ name: 'current_mileage', type: 'numeric', precision: 12, scale: 1 })
  currentMileage!: string;

  @Column({ name: 'refuel_date', type: 'timestamptz' })
  refuelDate!: Date;

  @Column({ name: 'refuel_amount', type: 'numeric', precision: 12, scale: 2 })
  refuelAmount!: string;

  @Column({ name: 'unit_price', type: 'numeric', precision: 10, scale: 4 })
  unitPrice!: string;

  @Column({ name: 'fuel_count', type: 'numeric', precision: 12, scale: 4 })
  fuelCount!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => MotoEntity, (moto) => moto.fuelRecords, {
    createForeignKeyConstraints: false,
    nullable: false,
  })
  @JoinColumn({ name: 'moto_id' })
  moto?: MotoEntity;
}
