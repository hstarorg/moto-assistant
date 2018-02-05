const Router = require('koa-router');
const config = require('../config');

const router = new Router({
  prefix: `${config.apiPrefix}/account`
});

router.post('/token', ctx => {
  ctx.body = 'ok';
});

module.exports = {
  router
};
