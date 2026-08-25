import ajax = require('../../utils/ajax');
import messageBox = require('../../utils/messageBox');
import type {
  LoginStatus,
  Moto,
  MotoAppOptions,
  MotoStatus
} from '../../types';

const app = getApp<MotoAppOptions>();
let unsubscribeLoginState: (() => void) | undefined;

Page({
  data: {
    hasLoginFailed: false,
    isLoaded: false,
    isLoadingMotos: false,
    loadFailed: false,
    loginStatus: 'loggingIn' as LoginStatus,
    motoList: [] as Moto[],
    restoringMotoId: 0,
    selectedStatus: 'active' as MotoStatus
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
        this._loadUserMotoList();
      }
    });

    const loginStatus = app.globalData.loginStatus;
    this.setData({
      hasLoginFailed: loginStatus === 'failed',
      loginStatus
    });
    if (loginStatus === 'ready') {
      this._loadUserMotoList();
    }
  },

  onShow() {
    if (app.globalData.loginStatus === 'ready' && this.data.isLoaded) {
      this._loadUserMotoList();
    }
  },

  onUnload() {
    unsubscribeLoginState?.();
    unsubscribeLoginState = undefined;
  },

  handleLoginRetry() {
    void app.doLogin().catch(() => undefined);
  },

  handleBtnAddTap() {
    wx.navigateTo({ url: '../moto-add/moto-add' });
  },

  handleDataRetry() {
    this._loadUserMotoList();
  },

  handleStatusChange(
    event: WechatMiniprogram.TouchEvent<
      WechatMiniprogram.IAnyObject,
      WechatMiniprogram.IAnyObject,
      { status: MotoStatus }
    >
  ) {
    const status = event.currentTarget.dataset.status;
    if (
      this.data.isLoadingMotos ||
      (status !== 'active' && status !== 'archived') ||
      status === this.data.selectedStatus
    ) {
      return;
    }

    this.setData({
      isLoaded: false,
      loadFailed: false,
      motoList: [],
      selectedStatus: status
    });
    this._loadUserMotoList();
  },

  navigateToFuelList(
    event: WechatMiniprogram.TouchEvent<
      WechatMiniprogram.IAnyObject,
      WechatMiniprogram.IAnyObject,
      { motoId: number }
    >
  ) {
    const motoId = event.currentTarget.dataset.motoId;
    wx.navigateTo({ url: `../fuel-list/fuel-list?motoId=${motoId}` });
  },

  navigateToMotoEdit(
    event: WechatMiniprogram.TouchEvent<
      WechatMiniprogram.IAnyObject,
      WechatMiniprogram.IAnyObject,
      { motoId: number }
    >
  ) {
    const motoId = event.currentTarget.dataset.motoId;
    wx.navigateTo({ url: `../moto-add/moto-add?motoId=${motoId}` });
  },

  handleRestoreMoto(
    event: WechatMiniprogram.TouchEvent<
      WechatMiniprogram.IAnyObject,
      WechatMiniprogram.IAnyObject,
      { motoId: number }
    >
  ) {
    const motoId = event.currentTarget.dataset.motoId;
    if (this.data.restoringMotoId) {
      return;
    }

    this.setData({ restoringMotoId: motoId });
    void ajax
      .post(`/motos/${motoId}/restore`, {}, {
        showLoading: false
      })
      .then(() => {
        messageBox.toast('车辆已恢复使用');
        this._loadUserMotoList();
      })
      .catch(() => undefined)
      .finally(() => {
        this.setData({ restoringMotoId: 0 });
      });
  },

  _loadUserMotoList() {
    if (this.data.isLoadingMotos) {
      return;
    }

    const status = this.data.selectedStatus;
    this.setData({ isLoadingMotos: true });
    ajax
      .get<Moto[]>(`/motos?status=${status}`)
      .then(({ data }) => {
        if (this.data.selectedStatus === status) {
          this.setData({ loadFailed: false, motoList: data });
        }
      })
      .catch(() => {
        if (this.data.selectedStatus === status) {
          this.setData({ loadFailed: true });
        }
      })
      .finally(() => {
        if (this.data.selectedStatus === status) {
          this.setData({ isLoaded: true, isLoadingMotos: false });
        }
      });
  }
});
