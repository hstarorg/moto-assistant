export interface AccountTokenResponse {
  token: string;
}

export interface MotoAppGlobalData {
  userInfo: WechatMiniprogram.UserInfo | null;
  code: string;
  token?: string;
}

export interface MotoAppOptions {
  globalData: MotoAppGlobalData;
  userInfoReadyCallback?: WechatMiniprogram.GetUserInfoSuccessCallback;
  doLogin(): void;
}

export interface Moto {
  id: number;
  motoName: string;
  motoLicensePlate: string;
  motoPhotoUrl: string;
}

export interface MotoInfo {
  motoPhotoUrl: string;
  motoName: string;
  motoBuyDate: string;
  motoLicensePlate: string;
}

export interface FuelModel {
  refuelDate: string;
  currentMileage: string;
  refuelAmount: string;
  uitlPrice: string;
}

export interface FuelRecord {
  id: number;
  currentMileage: number;
  refuelDate: number;
  refuelAmount: number;
  uitlPrice: number;
  fuelCount: number;
}

export interface FuelRecordView {
  id: number;
  currentMileage: number;
  refuelDate: string;
  refuelAmount: string;
  uitlPrice: string;
  fuelCount: string;
}

export interface StatisticsData {
  totalMileage: number | string;
  totalAmount: number | string;
  avgFuel: number | string;
  avgPrice?: number | string;
}

export interface FuelListResponse {
  statisticsData: StatisticsData;
  fuelList: FuelRecord[];
}
