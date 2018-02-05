const path = require('path');

module.exports = {
  port: 7410,
  apiPrefix: '/api/v1',
  routesPath: path.join(__dirname, 'routes'),
  wxParams: {
    appId: 'wx1b12531c503b20b6',
    appSecret: '4aeb5d3d9a0390a8f37b0616765e29e8'
  }
};
