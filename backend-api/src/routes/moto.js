const Router = require('koa-router');
const config = require('../config');
const { motoBiz, accountBiz } = require('../bizs');

const router = new Router({
  prefix: `${config.apiPrefix}/moto`
});

router.use(accountBiz.checkUserStatus);

router.post('/', motoBiz.addNewMoto);

router.get('/', motoBiz.getUserMotoList);

module.exports = {
  router
};
