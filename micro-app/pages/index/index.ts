import ajax = require('../../utils/ajax');
import type { LoginStatus, Moto, MotoAppOptions } from '../../types';

const app = getApp<MotoAppOptions>();

Page({
  data: {
    hasLoginFailed: false,
    isLoaded: false,
    isLoadingMotos: false,
    loginStatus: 'loggingIn' as LoginStatus,
    motoList: [] as Moto[]
  },

  onLoad() {
    app.loginStateChangedCallback = status => {
      this.setData({
        hasLoginFailed:
          status === 'failed' ||
          (status === 'loggingIn' && this.data.hasLoginFailed),
        loginStatus: status
      });
      if (status === 'ready') {
        this._loadUserMotoList();
      }
    };

    const loginStatus = app.globalData.loginStatus;
    this.setData({
      hasLoginFailed: loginStatus === 'failed',
      loginStatus
    });
    if (loginStatus === 'ready') {
      this._loadUserMotoList();
    }
  },

  onUnload() {
    app.loginStateChangedCallback = undefined;
  },

  handleLoginRetry() {
    void app.doLogin().catch(() => undefined);
  },

  handleBtnAddTap() {
    wx.navigateTo({
      url: '../moto-add/moto-add'
    });
  },

  navigateToFuelList(
    event: WechatMiniprogram.TouchEvent<
      WechatMiniprogram.IAnyObject,
      WechatMiniprogram.IAnyObject,
      { motoId: number }
    >
  ) {
    const motoId = event.currentTarget.dataset.motoId;
    wx.navigateTo({
      url: `../fuel-list/fuel-list?motoId=${motoId}`
    });
  },

  _loadUserMotoList() {
    if (this.data.isLoadingMotos) {
      return;
    }
    this.setData({ isLoadingMotos: true });
    ajax
      .get<Moto[]>('/motos')
      .then(({ data }) => {
        this.setData({ motoList: data });
      })
      .catch(() => undefined)
      .finally(() => {
        this.setData({ isLoaded: true, isLoadingMotos: false });
      });
  }
});
