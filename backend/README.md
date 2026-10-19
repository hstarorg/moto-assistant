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

migration 必须通过命令生成。所有 E2E 套件只使用 `E2E_DATABASE_URL`，不回退到 `DATABASE_URL` 或 `.env` 中的业务库。该 URL 必须使用 `postgres` / `postgresql` 协议、指向本机、库名以 `moto_payment_e2e_` 开头，且不能带查询参数或片段；不符合时在加载测试应用前退出。

E2E 会写入数据，请先创建专用测试库。首次用支付套件初始化表，之后可运行全部或单独的 API 套件：

```sh
export E2E_DATABASE_URL='postgresql://<测试用户>:<测试密码>@127.0.0.1:5432/moto_payment_e2e_local'
pnpm test:e2e payment.e2e-spec.ts
pnpm test:e2e
pnpm test:e2e:guard
```

`test:e2e:guard` 使用本地 TCP 探针检查误连接，不需要业务数据库；设置上述已初始化的测试库 URL 后，也会验证合法配置能覆盖原有 `DATABASE_URL`。

测试请使用 `pnpm test` / `pnpm test:e2e`，脚本已启用 Jest 加载 NestJS 12 ESM 包所需的 VM 模块支持；应用仍保持 CommonJS。

生产部署见[部署指南](../docs/deployment.md)，虚拟支付 SDK 用法及错误码见 [SDK README](src/lib/wechat-virtual-payment/README.md)。
