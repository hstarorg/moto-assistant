import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TipOrderStatus } from '../../constants';
import { DATABASE_SCHEMA } from '../constants';
import { UserEntity } from './user.entity';

@Entity({ name: 'tip_orders', schema: DATABASE_SCHEMA })
export class TipOrderEntity {
  @PrimaryGeneratedColumn('identity')
  id!: number;

  @Column({ name: 'out_trade_no', length: 32, unique: true })
  outTradeNo!: string;

  @Column({ name: 'client_request_id', length: 64, unique: true })
  clientRequestId!: string;

  @Column({ name: 'user_id' })
  userId!: number;

  @Column({ name: 'payer_open_id', length: 64 })
  payerOpenId!: string;

  @Column({ name: 'product_id', length: 64 })
  productId!: string;

  @Column({ name: 'unit_price', type: 'integer' })
  unitPrice!: number;

  @Column({ type: 'integer' })
  quantity!: number;

  @Column({ name: 'total_amount', type: 'integer' })
  totalAmount!: number;

  @Column({ type: 'smallint' })
  environment!: number;

  @Column({
    default: TipOrderStatus.PENDING,
    length: 32,
    type: 'varchar',
  })
  status!: TipOrderStatus;

  @Column({
    length: 128,
    name: 'wx_order_id',
    nullable: true,
    type: 'varchar',
    unique: true,
  })
  wxOrderId?: string | null;

  @Column({ name: 'paid_at', nullable: true, type: 'timestamptz' })
  paidAt?: Date | null;

  @Column({ name: 'refunded_at', nullable: true, type: 'timestamptz' })
  refundedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => UserEntity, 'tipOrders', {
    createForeignKeyConstraints: false,
    nullable: false,
  })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;
}
