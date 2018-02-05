const crypto = require('crypto');
const axios = require('axios').default;
const config = require('../config');

class WxHelper {
  constructor(appId, appSecret) {
    this.appId = appId;
    this.appSecret = appSecret;
  }
  /**
   * 通过appId、appSecret、jscode获取用户session_key和openid
   * @param {string} jscode 在客户端执行wx.login获取到的code
   * @param {{session_key:string, openid:string}}
   */
  async _getSessionKeyAndOpenIdByJscode(jscode) {
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${this.appId}&secret=${
      this.appSecret
    }&js_code=${jscode}&grant_type=authorization_code`;
    const { data } = await axios.get(url);
    if (data.openid) {
      return data;
    }
    return null;
  }

  /**
   * 解密数据
   * @param {*} encryptedData 
   * @param {*} iv 
   * @param {*} sessionKey 
   */
  async _decryptData(encryptedData, iv, sessionKey) {
    sessionKey = new Buffer(sessionKey, 'base64');
    encryptedData = new Buffer(encryptedData, 'base64');
    iv = new Buffer(iv, 'base64');
    let decoded;
    try {
      const decipher = crypto.createDecipheriv('aes-128-cbc', sessionKey, iv);
      // 设置自动 padding 为 true，删除填充补位
      decipher.setAutoPadding(true);
      decoded = decipher.update(encryptedData, 'binary', 'utf8');
      decoded += decipher.final('utf8');
      decoded = JSON.parse(decoded);
    } catch (err) {
      throw err;
    }
    if (decoded.watermark.appid !== this.appId) {
      throw new Error('Illegal Buffer');
    }
    return decoded;
  }

  /**
   * 通过code、encryptedData、iv获取用户信息
   * @param {string} jscode 
   * @param {string} encryptedData 
   * @param {string} iv 
   */
  async getUserInfo(jscode, encryptedData, iv) {
    const sessionObj = await this._getSessionKeyAndOpenIdByJscode(jscode);
    if (!sessionObj) {
      return null;
    }
    const userInfo = await this._decryptData(encryptedData, iv, sessionObj.session_key);
    return userInfo;
  }
}

module.exports = new WxHelper(config.wxParams.appId, config.wxParams.appSecret);
