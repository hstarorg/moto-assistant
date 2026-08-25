import messageBox = require('../../utils/messageBox');

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
    wx.navigateTo({
      url: '../moto-archived/moto-archived',
      fail() {
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
