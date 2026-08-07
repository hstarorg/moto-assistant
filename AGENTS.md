# AGENTS.md

## 项目概览

这是一个机车油耗记录工具，仓库包含两个相互配套的应用：

- `backend-api/`：Node.js 后端，基于 `fast-koa`/Koa、Joi 和 MySQL。
- `micro-app/`：原生微信小程序，负责微信登录、车辆管理及加油记录展示与录入。
- `docs/`：产品设计说明、MySQL 建表脚本和设计稿。

代码年代较早，依赖和部分微信 API 已经过时。除非任务明确要求升级，否则优先做范围小、兼容现有契约的修改，不要顺手进行大规模现代化改造。

## 目录与职责

### 后端 `backend-api/src/`

- `index.js`：应用入口；加载路由、统一处理 Joi/业务错误，并注入登录用户。
- `config.js`：端口、路由前缀、微信、MySQL、图片域名和七牛配置。
- `routes/`：HTTP 路由，只负责 URL、方法与业务函数的绑定。
- `bizs/`：请求校验、业务流程、响应组装。
- `bizs/schemas/`：Joi 请求模型。
- `bizs/sqlstore/`：SQL 常量；参数使用 `@name` 占位符。
- `common/db.js`：MySQL 连接池与 `fast-koa` 的 `MysqlClient`。
- `common/tokenStore.js`：仅存于进程内存的 token；重启即失效，最长 2 小时、闲置 20 分钟过期。
- `common/wxHelper.js`：微信 code 换取 session 并解密用户信息。
- `common/util.js`：校验、token 生成、七牛文件上传。

### 小程序 `micro-app/`

- `app.js`：微信登录和全局 token 初始化。
- `config.js`：后端 API 根地址。
- `utils/ajax.js`：`wx.request`/`wx.uploadFile` 封装，并统一附加 `x-ma-token`。
- `pages/index/`：车辆列表。
- `pages/moto-add/`：新增车辆和图片上传。
- `pages/fuel-list/`：加油记录、录入弹窗和汇总数据。
- `pages/statistics/`、`pages/about/`：当前是占位页。
- 每个页面保持微信小程序的 `.js`、`.json`、`.wxml`、`.wxss` 四文件结构。

## 核心数据流与契约

API 前缀为 `/api/v1`：

- `POST /account/token`：接收 `code`、`encryptedData`、`iv`，返回包含 `token` 的用户信息。
- `GET /motos`：返回当前用户的有效车辆。
- `POST /motos`：multipart 上传；文件字段名为 `file`，表单字段包含 `motoName`、`motoBuyDate`、`motoLicensePlate`、`motoPhotoUrl`。
- `GET /motos/:motoId/fuel`：返回 `{ statisticsData, fuelList }`。
- `POST /motos/:motoId/fuel`：新增加油记录。

除登录接口外，车辆接口依赖请求头 `x-ma-token`。新增或修改受保护接口时，保持 `accountBiz.checkUserStatus` 保护，并确认数据确实属于 `ctx.state.user`。

数据库结构以 `docs/create_tables.sql` 为准，包含 `user`、`moto`、`fuel_consumption` 三张表。日期在数据库中存毫秒时间戳；小程序表单通常传 `YYYY-MM-DD`，后端通过 `Date.parse` 转换。

`uitlPrice` 是现有数据库字段、Joi schema、SQL、API 和小程序状态共同使用的历史拼写。不要只在某一层改成 `unitPrice`；如需纠正，必须提供数据库迁移并同步修改所有调用方。

油耗统计有意排除最后一次加油记录：最后一次记录只用于确定当前总里程，汇总 SQL 使用 `id < lastFuel.id`。修改公式前先确认产品语义，不要把它当成普通的 off-by-one 自动修正。

## 本地开发

后端：

```sh
cd backend-api
npm install
npm run dev
```

构建后端：

```sh
cd backend-api
npm run build
```

运行前需要可访问的 MySQL，并执行 `docs/create_tables.sql`。微信登录和图片上传还需要有效的微信 `appSecret` 及七牛 `ak`/`sk`。当前配置直接写在 `backend-api/src/config.js` 中；不要提交真实密钥、个人数据库密码或新的生产凭据。若任务涉及配置重构，优先使用环境变量并保留清晰的本地默认/示例配置。

小程序通过微信开发者工具导入 `micro-app/`。联调本地后端时修改 `micro-app/config.js` 的 `apiHost`，并检查开发者工具中的域名校验设置。`project.config.json` 当前关闭了 URL 校验，且 `nodeModules` 为 `false`。

`backend-api/Dockerfile` 依赖预先生成的 `dist/`，其暴露端口 `5002` 与源码默认端口 `7410` 不一致。除非已同步确认构建产物和部署配置，否则不要把现有 Dockerfile 当作已验证的运行路径。

## 修改约定

- 延续现有 CommonJS 风格：`require`/`module.exports`，不在局部改动中混入 ESM 或 TypeScript。
- 延续现有格式：2 空格缩进、单引号、语句分号；避免仅为格式化而改动无关文件。
- 后端新接口遵循 route → biz → schema/SQL store 的现有分层，不在路由文件中堆业务或 SQL。
- 所有外部输入先通过 Joi 校验。涉及金额、油价、里程时同时考虑零值、负值、精度以及除零。
- SQL 参数继续使用命名占位符，不拼接用户输入。需要改表时同步更新 `docs/create_tables.sql`，并说明已有数据库的迁移方式。
- 小程序状态只能通过 `this.setData` 更新；事件名必须与 WXML 的 `bind*` 属性一致。
- API 字段变化必须同步检查后端 schema、SQL、业务代码、小程序请求/渲染以及文档。
- 不提交生成目录和依赖目录，如 `node_modules/`、`dist/`、`miniprogram_npm/`。
- 保持面向用户的提示为中文，并避免在响应、日志或 toast 中泄露 token、微信解密数据或基础设施凭据。

## 验证要求

仓库目前没有可用的自动化测试：后端的 `npm test` 只是占位命令，小程序的 `npm test` 会直接失败。因此不要声称测试通过，除非任务同时补充了真正的测试。

每次修改至少执行与范围匹配的检查：

1. 对改动过的 JavaScript 文件做语法检查，例如 `node --check path/to/file.js`。
2. 后端改动在依赖和配置可用时运行 `npm run build`，并手动验证受影响接口的成功、未登录和校验失败路径。
3. 数据库改动使用测试库验证建表/迁移 SQL 和相关查询，不要对共享或生产数据库试跑。
4. 小程序改动在微信开发者工具中编译，检查登录、页面跳转、表单校验、请求失败提示和受影响页面布局。
5. 跨端字段或接口改动必须做一次完整链路验证；车辆图片上传要单独覆盖 multipart 流程。

如果因为缺少微信、七牛或数据库凭据无法完成集成验证，在交付说明中明确列出已完成的静态检查和仍需人工验证的步骤。

## 已知风险

- `config.js` 含基础设施连接信息；修改配置时优先减少敏感信息暴露，不要复制到日志或文档。
- token 只保存在单进程内存中，不适用于多实例部署，也没有持久登录能力。
- 当前车辆详情接口仅按 `motoId` 查询，修改相关代码时应特别检查跨用户访问风险。
- `wx.getUserInfo`、`wx.authorize(scope.userInfo)` 等登录方式属于旧版微信小程序流程；升级时需要同时调整前后端认证契约。
- 依赖版本较旧。升级 Node.js、Koa/`fast-koa`、Joi、MySQL 或微信 SDK 时，应作为独立任务处理并增加回归验证。
