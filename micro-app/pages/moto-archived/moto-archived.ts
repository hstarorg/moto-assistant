import ajax = require('../../utils/ajax');
import messageBox = require('../../utils/messageBox');
import type { LoginStatus, Moto, MotoAppOptions } from '../../types';

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
    restoringMotoId: 0
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
        this._loadArchivedMotos();
      }
    });

    const loginStatus = app.globalData.loginStatus;
    this.setData({
      hasLoginFailed: loginStatus === 'failed',
      loginStatus
    });
    if (loginStatus === 'ready') {
      this._loadArchivedMotos();
    }
  },

  onShow() {
    if (app.globalData.loginStatus === 'ready' && this.data.isLoaded) {
      this._loadArchivedMotos();
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
    this._loadArchivedMotos();
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
      .post(`/motos/${motoId}/restore`, {}, { showLoading: false })
      .then(() => {
        messageBox.toast('车辆已恢复使用');
        this.setData({
          motoList: this.data.motoList.filter(moto => moto.id !== motoId)
        });
      })
      .catch(() => undefined)
      .finally(() => {
        this.setData({ restoringMotoId: 0 });
      });
  },

  _loadArchivedMotos() {
    if (this.data.isLoadingMotos) {
      return;
    }

    this.setData({ isLoadingMotos: true });
    ajax
      .get<Moto[]>('/motos?status=archived')
      .then(({ data }) => {
        this.setData({ loadFailed: false, motoList: data });
      })
      .catch(() => {
        this.setData({ loadFailed: true });
      })
      .finally(() => {
        this.setData({ isLoaded: true, isLoadingMotos: false });
      });
  }
});
