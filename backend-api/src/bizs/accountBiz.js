const { AccountSchemas } = require('./schemas');
const { AccountSqls } = require('./sqlstore');
const { wxHelper, tokenStore, db, util } = require('../common');

const processUserToken = async ctx => {
  const data = ctx.request.body;
  await util.validate(data, AccountSchemas.TOKEN_SCHEMA);
  const { encryptedData, iv, code } = data;
  const userInfo = await wxHelper.getUserInfo(code, encryptedData, iv);
  if (userInfo) {
    userInfo.createDate = userInfo.lastUpdateDate = Date.now();
    const findUser = await db.executeScalar(AccountSqls.FIND_USER_BY_OPENID, userInfo);
    if (findUser) {
      userInfo.id = findUser.id;
      await db.executeNonQuery(AccountSqls.UPDATE_USER, userInfo);
    } else {
      const userId = await db.executeInsert(AccountSqls.INSERT_USER, userInfo);
      userInfo.id = userId;
    }
    const token = util.generatorToken();
    userInfo.token = token;
    tokenStore.set(token, userInfo);
    ctx.body = userInfo;
    return;
  }
  ctx.throw(403);
};

const checkUserStatus = async (ctx, next) => {
  if (ctx.state.user) {
    return await next();
  }
  ctx.throw(401);
};

const setUserInfo = async (ctx, next) => {
  const token = ctx.headers['x-ma-token'];
  if (token) {
    const user = tokenStore.get(token);
    ctx.state.user = user;
  }
  await next();
};

module.exports = {
  processUserToken,
  checkUserStatus,
  setUserInfo
};
