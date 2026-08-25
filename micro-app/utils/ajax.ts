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
type UnauthorizedHandler = () => Promise<void>;

interface RequestOptions {
  auth?: boolean;
  showError?: boolean;
  showLoading?: boolean;
}

class ApiError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let token: string | undefined;
let loadingCount = 0;
let unauthorizedHandler: UnauthorizedHandler | undefined;
let unauthorizedPromise: Promise<void> | undefined;

const getResponseErrorMessage = (data: unknown): string => {
  if (typeof data === 'string') {
    return data;
  }
  if (typeof data !== 'object' || data === null) {
    return '';
  }

  const { error, message } = data as {
    error?: unknown;
    message?: unknown;
  };
  if (Array.isArray(message)) {
    return message.filter(item => typeof item === 'string').join('；');
  }
  if (typeof message === 'string') {
    return message;
  }
  return typeof error === 'string' ? error : '';
};

const buildUrl = (path: string): string => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${config.apiBaseUrl}${normalizedPath}`;
};

const buildHeaders = (auth: boolean): WechatMiniprogram.IAnyObject => {
  return auth && token ? { 'x-ma-token': token } : {};
};

const parseUploadData = (data: string): unknown => {
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return data;
  }
};

const showLoading = () => {
  loadingCount += 1;
  if (loadingCount === 1) {
    wx.showLoading({ mask: true, title: '加载中...' });
  }
};

const hideLoading = () => {
  loadingCount = Math.max(loadingCount - 1, 0);
  if (loadingCount === 0) {
    wx.hideLoading();
  }
};

const refreshAuthorization = (): Promise<void> => {
  token = undefined;
  if (!unauthorizedHandler) {
    return Promise.reject(new ApiError('登录状态已失效', 401));
  }
  if (!unauthorizedPromise) {
    unauthorizedPromise = unauthorizedHandler().finally(() => {
      unauthorizedPromise = undefined;
    });
  }
  return unauthorizedPromise;
};

const execute = async <T>(
  send: () => Promise<RequestResult<T>>,
  options: RequestOptions,
  canRetry = true
): Promise<RequestResult<T>> => {
  const result = await send();
  if (result.statusCode >= 200 && result.statusCode < 300) {
    return result;
  }
  if (result.statusCode === 401 && options.auth !== false && canRetry) {
    await refreshAuthorization();
    return execute(send, options, false);
  }

  const message =
    getResponseErrorMessage(result.data) ||
    (result.statusCode === 401 ? '登录状态已失效' : '请求失败，请稍后重试');
  throw new ApiError(message, result.statusCode);
};

const run = async <T>(
  send: () => Promise<RequestResult<T>>,
  options: RequestOptions
): Promise<RequestResult<T>> => {
  const shouldShowLoading = options.showLoading !== false;
  let loadingHidden = false;
  if (shouldShowLoading) {
    showLoading();
  }

  try {
    return await execute(send, options);
  } catch (error) {
    if (shouldShowLoading) {
      hideLoading();
      loadingHidden = true;
    }
    if (options.showError !== false) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : '网络异常，请稍后重试';
      messageBox.toast(message);
    }
    throw error;
  } finally {
    if (shouldShowLoading && !loadingHidden) {
      hideLoading();
    }
  }
};

const request = <T>(
  method: HttpMethod,
  path: string,
  data?: RequestData,
  options: RequestOptions = {}
): Promise<RequestResult<T>> => {
  return run(
    () =>
      new Promise((resolve, reject) => {
        wx.request({
          url: buildUrl(path),
          data,
          method,
          header: buildHeaders(options.auth !== false),
          dataType: 'json',
          success(res) {
            resolve(res as unknown as RequestResult<T>);
          },
          fail() {
            reject(new ApiError('网络异常，请稍后重试'));
          }
        });
      }),
    options
  );
};

const ajax = {
  get<T = WechatMiniprogram.IAnyObject>(
    path: string,
    options?: RequestOptions
  ) {
    return request<T>('GET', path, undefined, options);
  },

  post<T = WechatMiniprogram.IAnyObject>(
    path: string,
    data: RequestData,
    options?: RequestOptions
  ) {
    return request<T>('POST', path, data, options);
  },

  put<T = WechatMiniprogram.IAnyObject>(
    path: string,
    data: RequestData,
    options?: RequestOptions
  ) {
    return request<T>('PUT', path, data, options);
  },

  patch<T = WechatMiniprogram.IAnyObject>(
    path: string,
    data?: RequestData,
    options?: RequestOptions
  ) {
    return request<T>('PATCH', path, data, options);
  },

  delete<T = WechatMiniprogram.IAnyObject>(
    path: string,
    options?: RequestOptions
  ) {
    return request<T>('DELETE', path, undefined, options);
  },

  setToken(value?: string) {
    token = value;
  },

  setUnauthorizedHandler(handler: UnauthorizedHandler) {
    unauthorizedHandler = handler;
  },

  uploadFile<T = WechatMiniprogram.IAnyObject>(
    path: string,
    filePath: string,
    formData: WechatMiniprogram.IAnyObject,
    options: RequestOptions = {}
  ): Promise<RequestResult<T>> {
    return run(
      () =>
        new Promise((resolve, reject) => {
          wx.uploadFile({
            url: buildUrl(path),
            filePath,
            name: 'file',
            header: buildHeaders(options.auth !== false),
            formData,
            success(res) {
              resolve({
                ...res,
                data: parseUploadData(res.data)
              } as unknown as RequestResult<T>);
            },
            fail() {
              reject(new ApiError('网络异常，请稍后重试'));
            }
          });
        }),
      options
    );
  }
};

export = ajax;
