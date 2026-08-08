type EnvVersion = 'develop' | 'trial' | 'release';

interface EnvironmentConfig {
  apiBaseUrl: string;
}

const environments: Record<EnvVersion, EnvironmentConfig> = {
  develop: {
    apiBaseUrl: 'http://127.0.0.1:7410/api/v1'
  },
  trial: {
    apiBaseUrl: 'https://apis.hstar.vip/moto/api/v1'
  },
  release: {
    apiBaseUrl: 'https://apis.hstar.vip/moto/api/v1'
  }
};

const accountInfo = wx.getAccountInfoSync();
const envVersion = accountInfo.miniProgram.envVersion as EnvVersion;
const environment = environments[envVersion];

if (!environment) {
  throw new Error(`不支持的小程序运行环境：${envVersion}`);
}

if (envVersion !== 'develop' && !environment.apiBaseUrl.startsWith('https://')) {
  throw new Error('体验版和正式版 API 必须使用 HTTPS');
}

const config = Object.freeze({
  envVersion,
  apiBaseUrl: environment.apiBaseUrl.replace(/\/+$/, '')
});

export = config;
