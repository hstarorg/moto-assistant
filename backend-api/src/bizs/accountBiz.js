const { validator } = require('fast-koa');
const { AccountSchemas } = require('./schemas');
const { wxHelper } = require('../common');


const processUserToken = async ctx => {
  const data = ctx.request.body;
  await validator.validate(data, AccountSchemas.TOKEN_SCHEMA);
  const { encryptedData, iv, code } = data;
  const userInfo = await wxHelper.getUserInfo(code, encryptedData, iv);
  // "openId": "o-Ree4s6_eNtlkaJCAYeGey3sX6M",
  // "nickName": "幻☆精灵",
  // "gender": 1,
  // "language": "zh_CN",
  // "city": "Chengdu",
  // "province": "Sichuan",
  // "country": "China",
  // "avatarUrl": "https://wx.qlogo.cn/mmopen/vi_32/PiajxSqBRaELf0o9iaZYxI5YFib0Aib8Atu2eEj1AmXmqUGIeUj457NZpniac8RgNMY22xJp3Gu6ibhjPNeuzBgoWQ2w/0",
  ctx.body = userInfo;
};

module.exports = {
  processUserToken
};
