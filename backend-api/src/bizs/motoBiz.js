const { validator } = require('fast-koa');
const { db, util } = require('../common');
const { MotoSqls } = require('./sqlstore');
const { MotoSchemas } = require('./schemas');

const addNewMoto = async ctx => {
  const { fields, files } = ctx.request.body;
  await validator.validate(fields, MotoSchemas.MOTO_SCHEMA);
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

module.exports = { addNewMoto, getUserMotoList };
