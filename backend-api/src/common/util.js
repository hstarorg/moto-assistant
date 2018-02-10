const path = require('path');
const uuid = require('uuid');
const qiniu = require('qiniu');
const { validator } = require('fast-koa');
const config = require('../config');
const joiLanguageZh = require('./joi_language_zh');

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

  /**
   * 验证数据合法
   * @param {any} data
   * @param {any} schema
   */
  validate(data, schema) {
    return validator.validate(data, schema, {
      abortEarly: false,
      allowUnknown: true,
      language: joiLanguageZh
    });
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
