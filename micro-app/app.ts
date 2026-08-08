import ajax = require('./utils/ajax');
import messageBox = require('./utils/messageBox');
import type { AccountTokenResponse, MotoAppOptions } from './types';

let loginPromise: Promise<void> | undefined;

const getLoginCode = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    wx.login({
      success({ code }) {
        if (code) {
          resolve(code);
          return;
        }
        reject(new Error('微信登录未返回有效凭证'));
      },
      fail() {
        reject(new Error('微信登录失败'));
      }
    });
  });
};

App<MotoAppOptions>({
  onLaunch() {
    ajax.setUnauthorizedHandler(() => {
      this.globalData.token = undefined;
      return this.doLogin();
    });
    void this.doLogin().catch(() => {
      messageBox.toast('登录失败，请稍后重试');
    });
  },

  doLogin() {
    if (loginPromise) {
      return loginPromise;
    }

    loginPromise = getLoginCode()
      .then(code =>
        ajax.post<AccountTokenResponse>(
          '/account/token',
          { code },
          { auth: false, showError: false }
        )
      )
      .then(({ data }) => {
        this.globalData.token = data.token;
        ajax.setToken(data.token);
        const callback = this.loginReadyCallback;
        this.loginReadyCallback = undefined;
        callback?.();
      })
      .finally(() => {
        loginPromise = undefined;
      });

    return loginPromise;
  },

  globalData: {}
});
