const path = require('path');

module.exports = {
  port: 7410,
  apiPrefix: '/api/v1',
  routesPath: path.join(__dirname, 'routes'),
  wxParams: {
    appId: 'wx1b12531c503b20b6',
    appSecret: ''
  },
  dbConfig: {
    connectionLimit: 10,
    host: '192.168.1.200',
    port: 3308,
    user: 'root',
    password: 'humin',
    database: 'moto_db'
  },
  appName: 'moto_assistant',
  imageHost: 'http://img.hstar.org/',
  qiniu: {
    ak: '',
    sk: ''
  }
};
