const { db, util } = require('../common');
const { MotoSqls } = require('./sqlstore');
const { MotoSchemas } = require('./schemas');

const addNewMoto = async ctx => {
  const { fields, files } = ctx.request.body;
  await util.validate(fields, MotoSchemas.MOTO_SCHEMA);
  const now = Date.now();
  const motoPhotoUrl = (await util.saveFile(files.file)).path;
  const moto = Object.assign({}, fields, {
    ownerId: ctx.state.user.id,
    createDate: now,
    lastUpdateDate: now,
    motoBuyDate: Date.parse(fields.motoBuyDate),
    status: 'Active',
    motoPhotoUrl
  });
  await db.executeNonQuery(MotoSqls.CREATE_MOTO, moto);
  ctx.status = 201;
};

const getUserMotoList = async ctx => {
  const userId = ctx.state.user.id;
  const motoList = await db.executeQuery(MotoSqls.GET_USER_MOTO_LIST, { ownerId: userId });
  ctx.body = motoList;
};

const getMotoFuelList = async ctx => {
  const motoId = ctx.params.motoId;
  const fuelList = await db.executeQuery(MotoSqls.GET_MOTO_FUEL_LIST, { motoId });
  const statisticsData = await _getMotoStatisticsData(motoId);
  ctx.body = {
    statisticsData,
    fuelList
  };
};

const _getMotoStatisticsData = async motoId => {
  const lastFuel = await db.executeScalar(MotoSqls.GET_LAST_FUEL, { motoId });
  const result = {
    totalMileage: 0, // 总里程
    totalAmount: 0, // 总消费
    avgFuel: 0 // 平均油耗
  };
  let statisticsData;
  if (lastFuel) {
    statisticsData = await db.executeScalar(MotoSqls.GET_MOTO_STATISTICS_DATA, { motoId, id: lastFuel.id });
  }
  if (statisticsData && lastFuel) {
    result.totalAmount = statisticsData.totalAmount;
    result.totalMileage = lastFuel.currentMileage;
    // 油耗计算公式（计算百公里油耗）：总的耗油量 / 总里程 * 100
    result.avgFuel = (statisticsData.totalFuel / lastFuel.currentMileage * 100).toFixed(2);
  }
  return result;
};

const createFuelRecord = async ctx => {
  const motoId = ctx.params.motoId;
  const data = ctx.request.body;
  await util.validate(data, MotoSchemas.MOTO_FUEL_SCHEMA);
  const fuelRecord = Object.assign({}, data, {
    motoId,
    fuelCount: data.refuelAmount / data.uitlPrice,
    refuelDate: Date.parse(data.refuelDate),
    createDate: Date.now()
  });
  await db.executeNonQuery(MotoSqls.INSERT_FUEL_RECORD, fuelRecord);
  ctx.status = 201;
};

module.exports = { addNewMoto, getUserMotoList, getMotoFuelList, createFuelRecord };
