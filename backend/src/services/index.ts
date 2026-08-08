import { AccountService } from './account.service';
import { FuelService } from './fuel.service';
import { MotoService } from './moto.service';
import { ThirdPartyService } from './third-party.service';

export { AccountService, FuelService, MotoService, ThirdPartyService };
export type {
  AccountTokenResponse,
  FuelListResponse,
  FuelRecordResponse,
  FuelStatisticsResponse,
  MotoResponse,
} from './service.types';

export const ALL_SERVICES = [
  AccountService,
  MotoService,
  FuelService,
  ThirdPartyService,
];
