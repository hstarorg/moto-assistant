# Moto Assistant 后端

基于 NestJS 12、TypeORM 和 PostgreSQL，提供微信登录、车辆、加油记录、油耗统计及赞赏接口，图片存储使用 Cloudflare R2。

默认端口 `7410`，API 前缀 `/api/v1`，健康检查 `GET /api/v1/health`。

## 本地开发

安装 Node.js 24.15+（24.x）或 26+ 和 pnpm，复制 `.env.example` 为 `.env` 并填写配置。首次建库及配置说明见[部署指南](../docs/deployment.md)。

```sh
pnpm install
pnpm tm:run
pnpm dev
```

## 常用命令

```sh
pnpm test
pnpm exec eslint "{src,apps,libs,test}/**/*.ts"
pnpm build
pnpm tmg ./src/database/migrations/ChangeName
```

migration 必须通过命令生成。E2E 会写入数据，只能使用隔离测试库；支付套件要求 `E2E_DATABASE_URL` 指向本机、名称以 `moto_payment_e2e_` 开头的数据库。

测试请使用 `pnpm test` / `pnpm test:e2e`，脚本已启用 Jest 加载 NestJS 12 ESM 包所需的 VM 模块支持；应用仍保持 CommonJS。

生产部署见[部署指南](../docs/deployment.md)，虚拟支付 SDK 用法及错误码见 [SDK README](src/lib/wechat-virtual-payment/README.md)。
