const Router = require('koa-router');
const config = require('../config');

const router = new Router({ path: `${config.apiPrefix}/moto` });

module.exports = {
  router
};
