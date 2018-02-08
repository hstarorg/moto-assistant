const Router = require('koa-router');
const config = require('../config');
const { motoBiz, accountBiz } = require('../bizs');

const router = new Router({
  prefix: `${config.apiPrefix}/motos`
});

router.use(accountBiz.checkUserStatus);

// 新增车辆
router.post('/', motoBiz.addNewMoto);
// 获取用户的车辆列表
router.get('/', motoBiz.getUserMotoList);
// 获取车辆下的加油信息列表
router.get('/:motoId/fuel', motoBiz.getMotoFuelList);
// 录入加油信息
router.post('/:motoId/fuel', motoBiz.createFuelRecord);

module.exports = {
  router
};
