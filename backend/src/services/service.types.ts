import type { MotoStatus } from '../constants';
import type { TipOrderStatus } from '../constants';

export interface AccountTokenResponse {
  token: string;
}

export interface FuelStatisticsResponse {
  avgFuel: number;
  avgPrice: number;
  currentMileage: number;
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
  nextCursor: string | null;
  statisticsData: FuelStatisticsResponse;
  totalCount: number;
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

export interface TipPaymentParameters {
  mode: 'short_series_goods';
  paySig: string;
  signData: string;
  signature: string;
}

export interface CreateTipOrderResponse {
  amountYuan: number;
  orderNo: string;
  payment: TipPaymentParameters;
}

export interface TipOrderResponse {
  amountYuan: number;
  createdAt: string;
  orderNo: string;
  paidAt: string | null;
  status: TipOrderStatus;
}
