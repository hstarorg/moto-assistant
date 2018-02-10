const messageBox = require('./messageBox');

const defaults = {
  headers: {}
};

const _request = (method, url, data, options) => {
  return new Promise((resolve, reject) => {
    const reqObject = {
      url,
      data,
      method,
      header: defaults.headers,
      dataType: 'json',
      success(res) {
        console.log('ok', res);
        if (res.statusCode >= 400) {
          messageBox.toast(res.data && res.data.error || res.data || '');
          return reject(res);
        }
        resolve(res);
      },
      fail(res) {
        reject(res);
      }
    };
    wx.request(reqObject);
  });
};

module.exports = {
  get(url) {
    return _request('GET', url, null, {});
  },
  post(url, data) {
    return _request('POST', url, data, {});
  },
  put(url, data) {
    return _request('PUT', url, data, {});
  },
  delete(url, data) {
    return _request('DELETE', url, null, {});
  },
  setToken(token) {
    defaults.headers['x-ma-token'] = token;
  },
  uploadFile(url, filePath, formData) {
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url,
        filePath,
        name: 'file',
        header: defaults.headers,
        formData,
        success(res) {
          resolve(res);
        }, fail(res) {
          reject(res);
        }
      })
    })
  }
};