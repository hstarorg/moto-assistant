import ajax = require('../../utils/ajax');
import messageBox = require('../../utils/messageBox');
import type {
  FuelListResponse,
  LoginStatus,
  Moto,
  MotoAppOptions
} from '../../types';

interface MotoStatisticsResult {
  moto: Moto;
  response?: FuelListResponse;
}

interface MotoStatisticsView {
  avgFuelText: string;
  avgPriceText: string;
  currentMileageText: string;
  hasStatistics: boolean;
  id: number;
  loadFailed: boolean;
  motoLicensePlate: string;
  motoName: string;
  motoPhotoUrl: string;
  recordCountText: string;
  totalAmountText: string;
}

interface StatisticsSummaryView {
  avgFuelText: string;
  avgPriceText: string;
  recordCountText: string;
  totalAmountText: string;
}

const EMPTY_SUMMARY: StatisticsSummaryView = {
  avgFuelText: '--',
  avgPriceText: '--',
  recordCountText: '0',
  totalAmountText: '0.00'
};

const app = getApp<MotoAppOptions>();
let unsubscribeLoginState: (() => void) | undefined;

const fixed = (value: number, digits = 2): string => value.toFixed(digits);

const toMotoStatisticsView = ({
  moto,
  response
}: MotoStatisticsResult): MotoStatisticsView => {
  if (!response) {
    return {
      avgFuelText: '--',
      avgPriceText: '--',
      currentMileageText: '--',
      hasStatistics: false,
      id: moto.id,
      loadFailed: true,
      motoLicensePlate: moto.motoLicensePlate,
      motoName: moto.motoName,
      motoPhotoUrl: moto.motoPhotoUrl,
      recordCountText: '--',
      totalAmountText: '--'
    };
  }

  const { fuelList, statisticsData } = response;
  const hasStatistics = fuelList.length >= 2;
  return {
    avgFuelText: hasStatistics ? fixed(statisticsData.avgFuel) : '--',
    avgPriceText: hasStatistics ? fixed(statisticsData.avgPrice) : '--',
    currentMileageText:
      fuelList.length > 0 ? fixed(statisticsData.currentMileage, 1) : '--',
    hasStatistics,
    id: moto.id,
    loadFailed: false,
    motoLicensePlate: moto.motoLicensePlate,
    motoName: moto.motoName,
    motoPhotoUrl: moto.motoPhotoUrl,
    recordCountText: String(fuelList.length),
    totalAmountText: hasStatistics
      ? fixed(statisticsData.totalAmount)
      : '--'
  };
};

const buildSummary = (
  results: MotoStatisticsResult[]
): StatisticsSummaryView => {
  let recordCount = 0;
  let totalAmount = 0;
  let weightedFuel = 0;
  let weightedPrice = 0;
  let weightedMileage = 0;

  results.forEach(({ response }) => {
    if (!response) {
      return;
    }

    const { fuelList, statisticsData } = response;
    recordCount += fuelList.length;
    totalAmount += statisticsData.totalAmount;
    if (fuelList.length >= 2 && statisticsData.totalMileage > 0) {
      weightedMileage += statisticsData.totalMileage;
      weightedFuel += statisticsData.avgFuel * statisticsData.totalMileage;
      weightedPrice += statisticsData.avgPrice * statisticsData.totalMileage;
    }
  });

  return {
    avgFuelText:
      weightedMileage > 0 ? fixed(weightedFuel / weightedMileage) : '--',
    avgPriceText:
      weightedMileage > 0 ? fixed(weightedPrice / weightedMileage) : '--',
    recordCountText: String(recordCount),
    totalAmountText: fixed(totalAmount)
  };
};

Page({
  data: {
    hasLoginFailed: false,
    isLoaded: false,
    isLoading: false,
    loadFailed: false,
    loginStatus: 'loggingIn' as LoginStatus,
    motoStatistics: [] as MotoStatisticsView[],
    partialFailure: false,
    summary: { ...EMPTY_SUMMARY }
  },

  onLoad() {
    unsubscribeLoginState?.();
    unsubscribeLoginState = app.subscribeLoginState(status => {
      this.setData({
        hasLoginFailed:
          status === 'failed' ||
          (status === 'loggingIn' && this.data.hasLoginFailed),
        loginStatus: status
      });
      if (status === 'ready') {
        this._loadStatistics();
      }
    });

    const loginStatus = app.globalData.loginStatus;
    this.setData({
      hasLoginFailed: loginStatus === 'failed',
      loginStatus
    });
  },

  onShow() {
    if (app.globalData.loginStatus === 'ready') {
      this._loadStatistics();
    }
  },

  onUnload() {
    unsubscribeLoginState?.();
    unsubscribeLoginState = undefined;
  },

  handleLoginRetry() {
    void app.doLogin().catch(() => undefined);
  },

  handleDataRetry() {
    this._loadStatistics();
  },

  handleAddMoto() {
    wx.navigateTo({ url: '../moto-add/moto-add' });
  },

  navigateToFuelList(
    event: WechatMiniprogram.TouchEvent<
      WechatMiniprogram.IAnyObject,
      WechatMiniprogram.IAnyObject,
      { motoId: number }
    >
  ) {
    wx.navigateTo({
      url: `../fuel-list/fuel-list?motoId=${event.currentTarget.dataset.motoId}`
    });
  },

  _loadStatistics() {
    if (this.data.isLoading) {
      return;
    }

    this.setData({ isLoading: true });
    void ajax
      .get<Moto[]>('/motos', { showError: false, showLoading: false })
      .then(async ({ data: motos }) => {
        const results = await Promise.all(
          motos.map(async moto => {
            try {
              const { data: response } = await ajax.get<FuelListResponse>(
                `/motos/${moto.id}/fuel`,
                { showError: false, showLoading: false }
              );
              return { moto, response };
            } catch {
              return { moto };
            }
          })
        );
        const partialFailure = results.some(result => !result.response);
        this.setData({
          isLoaded: true,
          loadFailed: false,
          motoStatistics: results.map(toMotoStatisticsView),
          partialFailure,
          summary: buildSummary(results)
        });
        if (partialFailure) {
          messageBox.toast('部分车辆统计暂时无法加载');
        }
      })
      .catch(() => {
        this.setData({ isLoaded: true, loadFailed: true });
      })
      .finally(() => {
        this.setData({ isLoading: false });
      });
  }
});
