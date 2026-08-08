import ajax = require('../../utils/ajax');
import type { Moto, MotoAppOptions } from '../../types';

const app = getApp<MotoAppOptions>();

Page({
  data: {
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

  onReady() {
    wx.showLoading({ title: '加载中...' });
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
    ajax.get<Moto[]>('/motos').then(({ data }) => {
      wx.hideLoading();
      this.setData({ motoList: data });
    });
  }
});
