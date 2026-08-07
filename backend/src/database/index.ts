import { FuelRecordEntity } from './entities/fuel-record.entity';
import { MotoEntity } from './entities/moto.entity';
import { UserEntity } from './entities/user.entity';

export { FuelRecordEntity, MotoEntity, UserEntity };

export const DATABASE_SCHEMA = 'moto_assistant';
export const ALL_ENTITIES = [FuelRecordEntity, MotoEntity, UserEntity];
