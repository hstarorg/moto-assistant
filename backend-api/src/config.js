const path = require('path');

module.exports = {
  port: 7410,
  apiPrefix: '/api/v1',
  routesPath: path.join(__dirname, 'routes')
};
