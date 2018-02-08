const Joi = require('joi');

module.exports = {
  MOTO_SCHEMA: Joi.object().keys({
    motoName: Joi.string().required(),
    motoBuyDate: Joi.string().required(),
    motoLicensePlate: Joi.string().required(),
    motoPhotoUrl: Joi.string().required()
  }),
  MOTO_FUEL_SCHEMA: Joi.object().keys({
    currentMileage: Joi.number().required(),
    refuelDate: Joi.string().required(),
    refuelAmount: Joi.number().required(),
    uitlPrice: Joi.number().required()
  })
};
