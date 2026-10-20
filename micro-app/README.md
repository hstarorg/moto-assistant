# Moto Assistant 小程序

微信原生小程序，使用 TypeScript，提供车辆管理、加油记录、油耗统计和支持开发者功能。

## 本地开发

```sh
pnpm install
```

使用微信开发者工具导入本目录，确认 AppID。所有版本统一使用 `config.ts` 中的生产 API 地址，开发调试也会访问生产数据。

个人联调设置放在已忽略的 `project.private.config.json`，不要关闭共享配置的域名校验。

## 检查

```sh
pnpm typecheck
pnpm test
```

域名配置、支付配置和发布步骤见[部署指南](../docs/deployment.md)。
