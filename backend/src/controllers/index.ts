import { AccountController } from './account.controller';
import { FuelController } from './fuel.controller';
import { HealthController } from './health.controller';
import { MotoController } from './moto.controller';

export const ALL_CONTROLLERS = [
  HealthController,
  AccountController,
  MotoController,
  FuelController,
];
