# Moto Assistant 后端

机车油耗记录工具的后端服务，提供微信登录、车辆管理、加油记录和油耗统计接口。
项目基于 NestJS 11、Express、TypeORM 和 PostgreSQL，车辆图片存储在私有
Cloudflare R2 Bucket 中，并通过短期预签名 URL 访问。

服务默认监听 `7410` 端口，API 前缀为 `/api/v1`，健康检查地址为
`GET /api/v1/health`。

## 本地运行

复制 `.env.example` 为 `.env` 并配置：

- `DATABASE_URL`：PostgreSQL 连接字符串
- `WECHAT_CONFIG`：`appId|appSecret`
- `R2_CONFIG`：`accountId|accessKeyId|secretAccessKey|bucket|keyPrefix`

```sh
pnpm install
pnpm tm:run
pnpm dev
```

Entity 发生变化后，可生成并检查新的 migration：

```sh
pnpm tmg ./src/database/migrations/ChangeName
```

运行 API 集成测试：

```sh
pnpm test:e2e
```

该测试会在 `DATABASE_URL` 指向的数据库中新增测试数据，只能连接开发数据库。

## 生产部署

前置条件是已有容器可以访问的 PostgreSQL 数据库。部署前在服务器环境中配置：

- `DATABASE_URL`：PostgreSQL 连接字符串
- `WECHAT_CONFIG`：`appId|appSecret`
- `R2_CONFIG`：`accountId|accessKeyId|secretAccessKey|bucket|keyPrefix`

拉取指定版本镜像、执行 migration 并启动服务（也可将 `latest` 替换为实际版本号）：

```sh
docker pull ghcr.io/hstarorg/moto-assistant-backend:latest

docker run -d --name moto-assistant-backend --restart unless-stopped -e DATABASE_URL -e WECHAT_CONFIG -e R2_CONFIG -p 7410:7410 ghcr.io/hstarorg/moto-assistant-backend:latest
```

服务启动后可通过 `/api/v1/health` 检查状态。
