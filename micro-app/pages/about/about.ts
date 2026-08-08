import messageBox = require('../../utils/messageBox');

const getVersionText = (): string => {
  try {
    const { envVersion, version } = wx.getAccountInfoSync().miniProgram;
    const environmentName = {
      develop: '开发版',
      trial: '体验版',
      release: ''
    }[envVersion];
    return [`${version ? `v${version}` : ''}`, environmentName]
      .filter(Boolean)
      .join(' · ') || '开发版';
  } catch {
    return '开发版';
  }
};

Page({
  data: {
    versionText: getVersionText()
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
