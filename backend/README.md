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

## 容器部署

```sh
docker build -t moto-assistant-backend .
docker run -d --restart unless-stopped --env-file /path/to/backend.env -p 7410:7410 moto-assistant-backend
```

生产配置通过镜像外部的环境变量文件提供，数据库地址必须能从容器内部访问。

GitHub Actions 的 `Backend image` workflow 只能手动运行。输入 `x.y.z` 版本号后，
流程会向 `ghcr.io/hstarorg/moto-assistant-backend` 推送 `x.y.z` 和 `latest` 两个镜像
标签，创建 `vx.y.z` Git 标签，并自动生成 GitHub Release。
