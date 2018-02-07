const path = require('path');
const uuid = require('uuid');
const qiniu = require('qiniu');
const config = require('../config');

qiniu.conf.ACCESS_KEY = config.qiniu.ak;
qiniu.conf.SECRET_KEY = config.qiniu.sk;

module.exports = {
  /**
   * 生成token字符串
   */
  generatorToken() {
    return `${uuid.v4()}.${uuid.v1()}`;
  },

  _getUploadToken(bucket) {
    const putPolicy = new qiniu.rs.PutPolicy({ scope: bucket });
    return putPolicy.uploadToken();
  },

  async saveFile(file, bucket) {
    bucket = bucket || 'autoupload';

    const extName = path.extname(file.name) || '.jpg';
    const key = `${config.appName}/${uuid.v4()}${extName}`;
    const uploadToken = this._getUploadToken(bucket);

    const putExtra = new qiniu.form_up.PutExtra();
    const formUploader = new qiniu.form_up.FormUploader();
    return await new Promise((resolve, reject) => {
      formUploader.putFile(uploadToken, key, file.path, putExtra, function(err, body, res) {
        if (err) {
          return reject(err);
        }
        resolve({ res, path: `${config.imageHost}${key}` });
      });
    });
  }
};
