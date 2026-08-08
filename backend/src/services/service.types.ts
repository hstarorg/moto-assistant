import type { MotoStatus } from '../constants';

export interface AccountTokenResponse {
  token: string;
}

export interface FuelStatisticsResponse {
  avgFuel: number;
  avgPrice: number;
  totalAmount: number;
  totalMileage: number;
}

export interface FuelRecordResponse {
  createdAt: string;
  currentMileage: number;
  fuelCount: number;
  id: number;
  motoId: number;
  refuelAmount: number;
  refuelDate: string;
  unitPrice: number;
  updatedAt: string;
}

export interface FuelListResponse {
  fuelList: FuelRecordResponse[];
  statisticsData: FuelStatisticsResponse;
}

export interface MotoResponse {
  createdAt: string;
  id: number;
  motoBuyDate: string;
  motoLicensePlate: string;
  motoName: string;
  motoPhotoUrl: string;
  ownerId: number;
  status: MotoStatus;
  updatedAt: string;
}
