# 部署指南

以下命令在仓库根目录执行；配置中的占位值需替换为实际值。

## 1. 准备资源

- 准备 Docker、PostgreSQL、私有 Cloudflare R2 Bucket、小程序 AppID / AppSecret 和 HTTPS API 域名。
- 创建数据库，并在目标库执行一次 `CREATE SCHEMA IF NOT EXISTS moto_assistant;`，确保应用数据库用户有该 schema 的建表和读写权限。
- 已有数据库升级前先备份；数据库地址必须能从容器访问，不能使用指向容器自身的 `localhost`。

## 2. 配置后端

在服务器创建 `/srv/moto-assistant/backend.env`，仅允许部署用户读取，不提交仓库。Docker env 文件的值不加外层引号，也不写 `export`。

```dotenv
NODE_ENV=production
DATABASE_URL=postgresql://<数据库用户>:<数据库密码>@<数据库地址>:5432/<数据库名>
WECHAT_CONFIG=<appId>|<appSecret>
R2_CONFIG=<accountId>|<accessKeyId>|<secretAccessKey>|<bucket>|<keyPrefix>
WECHAT_VPAY_CONFIG=
```

不启用赞赏时，`WECHAT_VPAY_CONFIG` 留空。所有密钥仅保存在服务端。

## 3. 部署后端

构建镜像，先执行迁移，成功后再启动服务。服务启动不会自动执行迁移。

```sh
docker build -t moto-assistant-backend:release ./backend

docker run --rm --env-file /srv/moto-assistant/backend.env \
  moto-assistant-backend:release \
  node node_modules/typeorm/cli.js migration:run \
  -d dist/database/data-source-for-migrations.js

docker run -d --name moto-assistant-backend --restart unless-stopped \
  --env-file /srv/moto-assistant/backend.env \
  -p 127.0.0.1:7410:7410 moto-assistant-backend:release

curl --fail http://127.0.0.1:7410/api/v1/health
```

配置同机 HTTPS 反向代理转发到 `127.0.0.1:7410`，再检查外部健康检查地址。若代理增加路径前缀，小程序 API 地址和微信推送 URL 也须包含该前缀。

更新时构建新版本镜像、备份数据库、执行迁移，再由部署工具替换旧容器；不要直接重复创建同名容器。迁移失败则停止更新，不自动回滚业务数据。

## 4. 配置赞赏（可选）

1. 在小程序后台开通个人主体虚拟支付，创建并审核道具 `zanshang`，单价 100 分。
2. 在消息推送页面准备 Token 和 43 位 EncodingAESKey，暂不保存；Token 自行生成，EncodingAESKey 使用页面随机生成。
3. 设置 `WECHAT_VPAY_CONFIG=<offerId>|<现网AppKey>|production|<消息Token>|<43位EncodingAESKey>`，重新创建后端容器使配置生效。
4. 将消息推送 URL 设为外部 API 基址追加 `/wechat/messages`，选择安全模式和 JSON，填写相同的 Token / EncodingAESKey，保存并通过 URL 验证。
5. 验证真实支付、查单、推送和退款。生产环境禁止使用沙箱配置；不能仅凭客户端支付成功或推送正文确认收款。

沙箱联调使用 `sandbox` 和对应沙箱 AppKey，仅用于非生产环境。凭据来源详见 [SDK README](../backend/src/lib/wechat-virtual-payment/README.md#messagetoken-和-encodingaeskey-从哪里来)。

## 5. 发布小程序

1. 在 `micro-app` 执行 `pnpm install`、`pnpm typecheck` 和 `pnpm test`。
2. 用微信开发者工具导入 `micro-app`，确认 AppID 与后端配置一致。
3. 确认 `micro-app/config.ts` 中的生产 HTTPS API 基址；开发版、体验版和正式版统一使用该地址。
4. 在小程序后台配置 request 和 uploadFile 合法域名，只填写 API 的 origin，不含路径；保持域名校验开启。
5. 上传体验版，真机检查登录、车辆、加油记录和图片；启用赞赏时另验 Android / iOS 支付、取消、金额上限及退款。
6. 确认隐私指引和审核说明后，提交审核并发布。
