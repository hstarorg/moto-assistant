import { AuthSessionEntity } from './entities/auth-session.entity';
import { FuelRecordEntity } from './entities/fuel-record.entity';
import { MotoEntity } from './entities/moto.entity';
import { UserEntity } from './entities/user.entity';

export { AuthSessionEntity, FuelRecordEntity, MotoEntity, UserEntity };
export { DATABASE_SCHEMA } from './constants';

export const ALL_ENTITIES = [
  AuthSessionEntity,
  FuelRecordEntity,
  MotoEntity,
  UserEntity,
];
