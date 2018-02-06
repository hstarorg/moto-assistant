const Router = require('koa-router');
const config = require('../config');
const { motoBiz } = require('../bizs');

const router = new Router({
  prefix: `${config.apiPrefix}/moto`
});

router.post('/', motoBiz.addNewMoto);

router.get('/', motoBiz.getUserMotoList);

module.exports = {
  router
};
