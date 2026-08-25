import messageBox = require('../../utils/messageBox');
import type { MotoAppOptions } from '../../types';

const app = getApp<MotoAppOptions>();

const getVersionText = (): string => {
  try {
    const { version } = wx.getAccountInfoSync().miniProgram;
    return version ? `v${version}` : '';
  } catch {
    return '';
  }
};

Page({
  data: {
    versionText: getVersionText()
  },

  navigateToAbout() {
    wx.navigateTo({ url: '../about/about' });
  },

  navigateToArchivedMotos() {
    app.globalData.pendingMotoStatus = 'archived';
    wx.switchTab({
      url: '/pages/index/index',
      fail() {
        if (app.globalData.pendingMotoStatus === 'archived') {
          delete app.globalData.pendingMotoStatus;
        }
        messageBox.toast('暂时无法打开已归档车辆');
      }
    });
  },

  openPrivacyContract() {
    if (typeof wx.openPrivacyContract !== 'function') {
      messageBox.toast('当前微信版本不支持查看隐私指引');
      return;
    }

    wx.openPrivacyContract({
      fail() {
        messageBox.toast('隐私指引打开失败');
      }
    });
  }
});
