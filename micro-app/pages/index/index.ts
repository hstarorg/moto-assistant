import ajax = require('../../utils/ajax');
import type { Moto, MotoAppOptions } from '../../types';

const app = getApp<MotoAppOptions>();

Page({
  data: {
    isLoaded: false,
    motoList: [] as Moto[]
  },

  onLoad() {
    if (app.globalData.token) {
      this._loadUserMotoList();
    } else {
      app.loginReadyCallback = () => {
        this._loadUserMotoList();
      };
    }
  },

  // 事件处理函数
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
    ajax
      .get<Moto[]>('/motos')
      .then(({ data }) => {
        this.setData({ motoList: data });
      })
      .catch(() => undefined)
      .finally(() => {
        this.setData({ isLoaded: true });
      });
  }
});
