import messageBox = require('../../utils/messageBox');

const getVersionText = (): string => {
  try {
    const { version } = wx.getAccountInfoSync().miniProgram;
    return version ? `v${version}` : '';
  } catch {
    return '';
  }
};

const versionText = getVersionText();

Page({
  data: {
    appName: '机车助理',
    footerText: ['机车助理', versionText].filter(Boolean).join(' · '),
    versionText
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
