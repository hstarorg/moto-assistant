import 'dotenv/config';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { ALL_ENTITIES, DATABASE_SCHEMA } from './index';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

export default new DataSource({
  type: 'postgres',
  url: databaseUrl,
  schema: DATABASE_SCHEMA,
  entities: ALL_ENTITIES,
  migrations: [join(__dirname, 'migrations', '*.js')],
  migrationsTableName: 'typeorm_migrations',
  migrationsRun: false,
  synchronize: false,
});
