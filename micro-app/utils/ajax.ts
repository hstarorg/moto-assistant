import config = require('../config');
import messageBox = require('./messageBox');

type HttpMethod = NonNullable<WechatMiniprogram.RequestOption['method']>;
type RequestData = string | WechatMiniprogram.IAnyObject | ArrayBuffer;
type RequestResult<T> = Omit<
  WechatMiniprogram.RequestSuccessCallbackResult,
  'data'
> & {
  data: T;
};

const defaults: { headers: WechatMiniprogram.IAnyObject } = {
  headers: {}
};

const getErrorMessage = (data: unknown): string => {
  if (typeof data === 'string') {
    return data;
  }
  if (typeof data === 'object' && data !== null && 'error' in data) {
    const error = (data as { error?: unknown }).error;
    return typeof error === 'string' ? error : '';
  }
  return '';
};

const buildUrl = (path: string): string => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${config.apiBaseUrl}${normalizedPath}`;
};

const request = <T>(
  method: HttpMethod,
  path: string,
  data?: RequestData
): Promise<RequestResult<T>> => {
  return new Promise((resolve, reject) => {
    const reqObject: WechatMiniprogram.RequestOption = {
      url: buildUrl(path),
      data,
      method,
      header: defaults.headers,
      dataType: 'json',
      success(res) {
        console.log('ok', res);
        if (res.statusCode >= 400) {
          messageBox.toast(getErrorMessage(res.data));
          reject(res);
          return;
        }
        resolve(res as unknown as RequestResult<T>);
      },
      fail(res) {
        reject(res);
      }
    };
    wx.request(reqObject);
  });
};

const ajax = {
  get<T = WechatMiniprogram.IAnyObject>(path: string) {
    return request<T>('GET', path);
  },

  post<T = WechatMiniprogram.IAnyObject>(path: string, data: RequestData) {
    return request<T>('POST', path, data);
  },

  put<T = WechatMiniprogram.IAnyObject>(path: string, data: RequestData) {
    return request<T>('PUT', path, data);
  },

  delete<T = WechatMiniprogram.IAnyObject>(path: string, _data?: RequestData) {
    return request<T>('DELETE', path);
  },

  setToken(token: string) {
    defaults.headers['x-ma-token'] = token;
  },

  uploadFile(
    path: string,
    filePath: string,
    formData: WechatMiniprogram.IAnyObject
  ): Promise<WechatMiniprogram.UploadFileSuccessCallbackResult> {
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: buildUrl(path),
        filePath,
        name: 'file',
        header: defaults.headers,
        formData,
        success(res) {
          resolve(res);
        },
        fail(res) {
          reject(res);
        }
      });
    });
  }
};

export = ajax;
