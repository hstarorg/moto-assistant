# moto-assistant

一个机车油耗记录工具。

## 微信小程序配置

小程序根据 `wx.getAccountInfoSync().miniProgram.envVersion` 选择 API：

- `develop` 使用本地开发 API。
- `trial` 和 `release` 使用 HTTPS API。

API Host 是公开的路由配置，不是 secret；微信 AppSecret、数据库密码和对象存储密钥只能配置在后端。

共享的 `micro-app/project.config.json` 保持域名校验开启。个人开发者工具配置写入 `project.private.config.json`，该文件已被 `.gitignore` 忽略；仅本地联调时可在其中关闭域名校验。

发布体验版或正式版前，需要在微信公众平台将 `micro-app/config.ts` 中对应 API 地址的 origin（不含 `/api/v1` 等路径）同时加入：

- request 合法域名
- uploadFile 合法域名

两者都必须使用有效的 HTTPS 配置。仓库配置不能替代微信公众平台的合法域名设置。
