const Joi = require('joi');

module.exports = {
  TOKEN_SCHEMA: Joi.object().keys({
    encryptedData: Joi.string().required(),
    iv: Joi.string().required(),
    code: Joi.string().required()
  })
};
