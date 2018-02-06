const uuid = require('uuid');

module.exports = {
  /**
   * 生成token字符串
   */
  generatorToken() {
    return `${uuid.v4()}.${uuid.v5()}`;
  }
};
