const _request = (method, url, data, options) => {
  return new Promise((resolve, reject) => {
    const reqObject = {
      url,
      data,
      method,
      dataType: 'json',
      success(res) {
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
  }
};