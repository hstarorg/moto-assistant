import ajax = require('./utils/ajax');
import type {
  AccountTokenResponse,
  LoginStatus,
  LoginStatusListener,
  MotoAppOptions
} from './types';

let loginPromise: Promise<void> | undefined;
const loginStateListeners = new Set<LoginStatusListener>();

const notifyLoginState = (status: LoginStatus): void => {
  loginStateListeners.forEach(listener => listener(status));
};

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
    notifyLoginState('loggingIn');

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
        notifyLoginState('ready');
      })
      .catch(error => {
        this.globalData.loginStatus = 'failed';
        notifyLoginState('failed');
        throw error;
      })
      .finally(() => {
        loginPromise = undefined;
      });

    return loginPromise;
  },

  subscribeLoginState(listener) {
    loginStateListeners.add(listener);
    return () => {
      loginStateListeners.delete(listener);
    };
  },

  globalData: {
    loginStatus: 'loggingIn'
  }
});
