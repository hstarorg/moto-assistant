import ajax = require('./utils/ajax');
import type { AccountTokenResponse, MotoAppOptions } from './types';

App<MotoAppOptions>({
  onLaunch() {
    this.doLogin();
  },

  doLogin() {
    wx.login({
      success: res => {
        ajax.post<AccountTokenResponse>('/account/token', { code: res.code })
          .then(({ data }) => {
            this.globalData.token = data.token;
            ajax.setToken(data.token);
            if (this.loginReadyCallback) {
              this.loginReadyCallback();
            }
          });
      }
    });
  },

  globalData: {}
});
