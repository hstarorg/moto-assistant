//index.js
//获取应用实例
const app = getApp();
const config = require('../../config');
const ajax = require('../../utils/ajax');
const messageBox = require('../../utils/messageBox');

Page({
  data: {
    userInfo: {},
    hasUserInfo: false,
    canIUse: wx.canIUse('button.open-type.getUserInfo'),
    motoList: []
  },
  onLoad: function () {
    if (app.globalData.userInfo) {
      this.setData({
        userInfo: app.globalData.userInfo,
        hasUserInfo: true
      })
    } else {
      // 在没有 open-type=getUserInfo 版本的兼容处理
      wx.getUserInfo({
        success: res => {
          app.globalData.userInfo = res.userInfo;
          this.setData({
            userInfo: res.userInfo,
            hasUserInfo: true
          })
        }
      })
    }
  },
  onReady() {
    wx.showLoading({ title: '加载中...' });
    setTimeout(() => {
      this._loadUserMotoList();
    }, 1000);
  },
  //事件处理函数
  handleBtnAddTap: function () {
    wx.navigateTo({
      url: '../moto-add/moto-add'
    })
  },
  _loadUserMotoList() {
    ajax.get(`${config.apiHost}/moto`)
      .then(({ data }) => {
        wx.hideLoading();
        this.setData({ motoList: data });
      });
  }
})
