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
  unitPrice: string;
}

export interface FuelRecord {
  createdAt: string;
  id: number;
  motoId: number;
  currentMileage: number;
  refuelDate: string;
  refuelAmount: number;
  unitPrice: number;
  fuelCount: number;
  updatedAt: string;
}

export interface FuelRecordView {
  id: number;
  currentMileage: number;
  refuelDate: string;
  refuelAmount: string;
  unitPrice: string;
  fuelCount: string;
}

export interface StatisticsData {
  totalMileage: number;
  totalAmount: number;
  avgFuel: number;
  avgPrice: number;
}

export interface FuelListResponse {
  statisticsData: StatisticsData;
  fuelList: FuelRecord[];
}
