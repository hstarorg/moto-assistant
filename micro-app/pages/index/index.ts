import ajax = require('../../utils/ajax');
import type { Moto, MotoAppOptions } from '../../types';

const app = getApp<MotoAppOptions>();

Page({
  data: {
    userInfo: {} as WechatMiniprogram.UserInfo,
    hasUserInfo: false,
    canIUse: wx.canIUse('button.open-type.getUserInfo'),
    motoList: [] as Moto[]
  },

  onLoad() {
    if (app.globalData.userInfo) {
      this.setData({
        userInfo: app.globalData.userInfo,
        hasUserInfo: true
      });
      this._loadUserMotoList();
    } else if (this.data.canIUse) {
      app.userInfoReadyCallback = () => {
        this._loadUserMotoList();
      };
    } else {
      // 在没有 open-type=getUserInfo 版本的兼容处理
      wx.getUserInfo({
        success: res => {
          app.globalData.userInfo = res.userInfo;
          this.setData({
            userInfo: res.userInfo,
            hasUserInfo: true
          });
        }
      });
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
