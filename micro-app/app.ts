import ajax = require('./utils/ajax');
import type { AccountTokenResponse, MotoAppOptions } from './types';

App<MotoAppOptions>({
  onLaunch() {
    // 登录
    wx.login({
      success: res => {
        this.globalData.code = res.code;
        // 获取用户信息
        wx.getSetting({
          success: settingResult => {
            if (settingResult.authSetting['scope.userInfo']) {
              this.doLogin();
            } else {
              wx.authorize({
                scope: 'scope.userInfo',
                success: () => {
                  this.doLogin();
                }
              });
            }
          }
        });
      }
    });
  },

  doLogin() {
    // 已经授权，可以直接调用 getUserInfo 获取头像昵称，不会弹框
    wx.getUserInfo({
      success: res => {
        // 可以将 res 发送给后台解码出 unionId
        this.globalData.userInfo = res.userInfo;
        const postData = {
          encryptedData: res.encryptedData,
          iv: res.iv,
          code: this.globalData.code
        };
        ajax.post<AccountTokenResponse>('/account/token', postData)
          .then(({ data }) => {
            this.globalData.token = data.token;
            ajax.setToken(data.token);
            if (this.userInfoReadyCallback) {
              this.userInfoReadyCallback(res);
            }
          });
      }
    });
  },

  globalData: {
    userInfo: null,
    code: ''
  }
});
