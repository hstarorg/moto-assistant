const path = require('path');
const fastKoa = require('fast-koa');
const config = require('./config');
const { accountBiz } = require('./bizs');

fastKoa.initApp({
  routesPath: config.routesPath,
  enableHelmet: true,
  enableLogger: true,
  enableResponseTime: true,
  bodyOptions: { multipart: true },
  onRoutesLoading(app) {
    app.use(async (ctx, next) => {
      try {
        await next();
        if (ctx.response.status === 404 && !ctx.response.body) {
          ctx.throw(404);
        }
      } catch (err) {
        if (err.isJoi || err.isBiz) {
          ctx.status = 400;
          return (ctx.body = { error: '请按照格式，填写正确的数据。' });
        }
        ctx.throw(err);
      }
    });
    app.use(accountBiz.setUserInfo);
  }
});

fastKoa
  .listen(config.port)
  .then(server => {
    const addr = server.address();
    console.log(`Server started. listen ${addr.port}`);
  })
  .catch(console.error);
