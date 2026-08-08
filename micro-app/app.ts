import ajax = require('./utils/ajax');
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
    void this.doLogin().catch(() => undefined);
  },

  doLogin() {
    if (loginPromise) {
      return loginPromise;
    }

    this.globalData.loginStatus = 'loggingIn';
    this.globalData.token = undefined;
    ajax.setToken();
    this.loginStateChangedCallback?.('loggingIn');

    loginPromise = getLoginCode()
      .then(code =>
        ajax.post<AccountTokenResponse>(
          '/account/token',
          { code },
          { auth: false, showError: false, showLoading: false }
        )
      )
      .then(({ data }) => {
        this.globalData.token = data.token;
        this.globalData.loginStatus = 'ready';
        ajax.setToken(data.token);
        this.loginStateChangedCallback?.('ready');
      })
      .catch(error => {
        this.globalData.loginStatus = 'failed';
        this.loginStateChangedCallback?.('failed');
        throw error;
      })
      .finally(() => {
        loginPromise = undefined;
      });

    return loginPromise;
  },

  globalData: {
    loginStatus: 'loggingIn'
  }
});
