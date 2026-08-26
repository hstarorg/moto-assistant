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
  }
});
