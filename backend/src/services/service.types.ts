import type { MotoStatus } from '../constants';

export interface AccountTokenResponse {
  avatarUrl: string;
  city: string;
  country: string;
  createdAt: string;
  gender: string;
  id: number;
  language: string;
  nickName: string;
  openId: string;
  province: string;
  token: string;
  updatedAt: string;
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

export interface WechatUserProfile {
  avatarUrl: string;
  city: string;
  country: string;
  gender: string;
  language: string;
  nickName: string;
  openId: string;
  province: string;
}
