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
import { DATABASE_SCHEMA } from '../constants';
import { UserEntity } from './user.entity';

@Index('idx_auth_sessions_user', ['userId'])
@Index('idx_auth_sessions_absolute_expires', ['absoluteExpiresAt'])
@Index('idx_auth_sessions_idle_expires', ['idleExpiresAt'])
@Entity({ name: 'auth_sessions', schema: DATABASE_SCHEMA })
export class AuthSessionEntity {
  @PrimaryGeneratedColumn('identity')
  id!: number;

  @Column({ name: 'user_id' })
  userId!: number;

  @Column({ name: 'token_hash', length: 64, unique: true })
  tokenHash!: string;

  @Column({ name: 'absolute_expires_at', type: 'timestamptz' })
  absoluteExpiresAt!: Date;

  @Column({ name: 'idle_expires_at', type: 'timestamptz' })
  idleExpiresAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => UserEntity, 'authSessions', {
    createForeignKeyConstraints: false,
    nullable: false,
  })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;
}
