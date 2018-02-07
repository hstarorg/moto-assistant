const Router = require('koa-router');
const config = require('../config');
const { commonBiz } = require('../bizs');

const router = new Router({
  prefix: `${config.apiPrefix}/common`
});

router.post('/upload', commonBiz.doFileUpload);

module.exports = {
  router
};
