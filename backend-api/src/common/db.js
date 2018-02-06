const mysql = require('mysql');
const { DBProviders: { MysqlClient } } = require('fast-koa');

const pool = mysql.createPool({
  connectionLimit: 10,
  host: '192.168.1.200',
  port: 3306,
  user: 'root',
  password: 'humin',
  database: 'moto_db'
});

module.exports = new MysqlClient(pool);
