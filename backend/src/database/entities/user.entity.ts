import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DATABASE_SCHEMA } from '../constants';
import { AuthSessionEntity } from './auth-session.entity';
import { MotoEntity } from './moto.entity';
import { TipOrderEntity } from './tip-order.entity';

@Entity({ name: 'users', schema: DATABASE_SCHEMA })
export class UserEntity {
  @PrimaryGeneratedColumn('identity')
  id!: number;

  @Column({ name: 'open_id', length: 64, unique: true })
  openId!: string;

  @Column({ name: 'nick_name', length: 100 })
  nickName!: string;

  @Column({ length: 16 })
  gender!: string;

  @Column({ length: 16 })
  language!: string;

  @Column({ length: 100 })
  city!: string;

  @Column({ length: 100 })
  province!: string;

  @Column({ length: 100 })
  country!: string;

  @Column({ name: 'avatar_url', length: 1000 })
  avatarUrl!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => MotoEntity, 'owner')
  motos?: MotoEntity[];

  @OneToMany(() => AuthSessionEntity, 'user')
  authSessions?: AuthSessionEntity[];

  @OneToMany(() => TipOrderEntity, 'user')
  tipOrders?: TipOrderEntity[];
}
