const { validator } = require('fast-koa');
const { db } = require('../common');
const { MotoSqls } = require('./sqlstore');
const { MotoSchemas } = require('./schemas');

const addNewMoto = async ctx => {
  const data = ctx.request.body;
  await validator.validate(data, MotoSchemas.MOTO_SCHEMA);
  const now = Date.now();
  const moto = Object.assign({}, data, {
    ownerId: ctx.state.user.id,
    createDate: now,
    lastUpdateDate: now,
    motoBuyDate: Date.parse(data.motoBuyDate),
    status: 'Active'
  });
  await db.executeNonQuery(MotoSqls.CREATE_MOTO, moto);
  ctx.status = 201;
};

const getUserMotoList = async ctx => {};

module.exports = { addNewMoto, getUserMotoList };
