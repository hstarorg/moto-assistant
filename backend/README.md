# Moto Assistant 后端

机车油耗记录工具的后端服务，提供微信登录、车辆管理、加油记录、油耗统计和
微信虚拟支付赞赏接口。
项目基于 NestJS 11、Express、TypeORM 和 PostgreSQL，车辆图片存储在私有
Cloudflare R2 Bucket 中，并通过短期预签名 URL 访问。

服务默认监听 `7410` 端口，API 前缀为 `/api/v1`，健康检查地址为
`GET /api/v1/health`。

## 本地运行

复制 `.env.example` 为 `.env` 并配置：

- `DATABASE_URL`：PostgreSQL 连接字符串
- `WECHAT_CONFIG`：`appId|appSecret`
- `R2_CONFIG`：`accountId|accessKeyId|secretAccessKey|bucket|keyPrefix`

赞赏功能只使用一个额外配置项。留空即关闭；开通微信个人主体虚拟支付后填写：

```dotenv
WECHAT_VPAY_CONFIG='<offerId>|<appKey>|<sandbox或production>|<messageToken>|<43位EncodingAESKey>'
```

其中 `messageToken` 和 `EncodingAESKey` 来自小程序后台的「开发」→「开发管理」→
「开发设置」→「消息推送」：Token 由开发者自行生成并填写，EncodingAESKey 在该页面
点击“随机生成”获得。两者必须与服务端配置完全一致；这里不是填写 AppSecret、虚拟支付
AppKey 或微信支付 APIv3 Key。完整配置步骤和安全要求见
[`src/lib/wechat-virtual-payment/README.md`](src/lib/wechat-virtual-payment/README.md#messagetoken-和-encodingaeskey-从哪里来)。

单笔赞赏上限固定为 200 元，单用户十分钟内最多创建 5 个待支付订单。消息推送
固定使用安全模式和 JSON 数据格式。生产环境必须使用 `production` 和现网 AppKey。

```sh
pnpm install
pnpm tm:run
pnpm dev
```

Entity 发生变化后，可生成并检查新的 migration：

```sh
pnpm tmg ./src/database/migrations/ChangeName
```

运行支付接口集成测试（使用独立、可丢弃的本机 PostgreSQL 数据库）：

```sh
E2E_DATABASE_URL='postgresql://<测试用户>:<测试密码>@127.0.0.1:<端口>/moto_payment_e2e_<名称>' \
  pnpm test:e2e payment.e2e-spec.ts
```

支付套件会创建 schema、执行现有 migration，并新增测试数据；只接受 loopback 地址和
`moto_payment_e2e_` 前缀的数据库，不读取业务 `DATABASE_URL`。使用真实 PostgreSQL、
鉴权和应用服务，仅替换外部微信 HTTP 请求；不需要真实微信凭据。
原有 `api.e2e-spec.ts` 仍使用 `DATABASE_URL`，运行全套 `pnpm test:e2e` 时需将它也显式
指向同一测试库（先执行支付套件初始化结构），禁止指向生产或有用户数据的数据库。

## 赞赏接口

客户端创建订单时传入整数元金额、刚通过 `wx.login` 获得的一次性 code 和幂等号：

```http
POST /api/v1/tips/orders
x-ma-token: <token>
Content-Type: application/json

{
  "amountYuan": 5,
  "loginCode": "<wx.login code>",
  "clientRequestId": "<16-64位随机幂等号>"
}
```

返回的 `payment` 对象可原样用于 `wx.requestVirtualPayment`。服务端订单状态查询：

```http
GET /api/v1/tips/orders/:orderNo
x-ma-token: <token>
```

微信公众平台的发货推送 URL 配置为：

```text
https://<API域名>/api/v1/wechat/messages
```

服务只接受微信消息安全模式。推送正文仅作为查单提醒：服务端会使用 AppKey 签名并
调用微信 `query_order`，只有查询结果能够更新本地订单，绝不直接采用 webhook 中的
金额、商品或状态。当前处理 `xpay_goods_deliver_notify` 和 `xpay_refund_notify`。

首次 GET URL 验证校验 `signature` 后原样返回 `echostr`；POST 安全模式推送仍使用
`msg_signature` 验签和 AES 解密。退款通知中的支付单号、退款单号仅用于定位，服务会
分别主动查询支付单和退款单，核对渠道及剩余可退金额。状态 5（商户扣款完成）不视为
退款完成；全额退款单到达状态 8 且原支付单剩余金额为 0 后，才标记 `refunded`。

启用虚拟支付后，后台补偿任务在启动时及每 5 分钟执行一次，每批最多扫描 50 笔当前
环境、最近 24 小时创建的 `pending` / `paid` 订单，按订单 ID 游标轮转，整轮结束后从头重试。任务不会
重叠执行，单笔失败不会阻断后续订单。主动查询到微信状态 2 或 3 时，在本地事务提交后
调用 `notify_provide_goods`；若确认失败，下一轮继续重试，微信已发货的订单不重复确认。
该任务不新增配置项；多实例可能重复查询或确认，状态更新由事务行锁保护，并以微信侧
订单状态为准。订单量超过单批上限时，一轮完整扫描会跨越多个调度周期。
超过 24 小时的订单不再自动扫描，不删除、不强制关闭；消息推送和用户主动查单仍可
同步其状态。历史异常订单通过只读数据库查询、服务日志和微信后台核对处理。

订单重新签名、查单、退款查询和发货确认均校验订单环境。历史订单与当前配置不一致时，
返回 HTTP 409 和 `TIP_ORDER_ENVIRONMENT_MISMATCH`，不会使用当前 AppKey 操作旧环境订单。
当前配置仍只保存一套环境密钥，切换环境后的旧订单需在原环境处理。

微信登录、token 请求和虚拟支付 HTTP 请求（含响应体）均设置 5 秒超时。token 提前被微信
拒绝时，只清除匹配的旧缓存并刷新重试一次；同进程的并发请求复用刷新结果。
排障日志使用 `wechat_virtual_payment_failure` / `wechat_request_failure` 事件，记录操作名、
业务订单号（如有）、稳定错误码及微信数值错误码，不记录密钥、token、签名、URL 或微信 errmsg。

查询类接口错误码：

| 错误码 | HTTP | 含义 |
| --- | --- | --- |
| `TIP_ORDER_NOT_FOUND` | 404 | 订单不存在或不属于当前用户，两种情况统一应答 |
| `TIP_ORDER_ENVIRONMENT_MISMATCH` | 409 | 订单环境与当前配置不一致 |
| `TIP_ORDER_QUERY_FAILED` | 503 | 微信查单暂不可用 |
| `TIP_REFUND_QUERY_FAILED` | 503 | 微信退款查询暂不可用 |
| `TIP_DELIVERY_CONFIRM_FAILED` | 503 | 发货确认暂不可用，补偿任务继续重试 |

微信个人主体虚拟支付协议封装位于 `src/lib/wechat-virtual-payment`，不依赖 NestJS 或数据库。业务层
只负责读取配置、提供微信 `access_token` 和持久化订单，后续其他服务端应用可直接复用
该协议客户端。

## 生产部署

前置条件是已有容器可以访问的 PostgreSQL 数据库。部署前在服务器环境中配置：

- `DATABASE_URL`：PostgreSQL 连接字符串
- `WECHAT_CONFIG`：`appId|appSecret`
- `R2_CONFIG`：`accountId|accessKeyId|secretAccessKey|bucket|keyPrefix`
- `WECHAT_VPAY_CONFIG`：上述合并后的虚拟支付配置

生产环境启用赞赏时，服务会拒绝其中的 `sandbox`，避免沙箱配置误上线。

拉取指定版本镜像、执行 migration 并启动服务（也可将 `latest` 替换为实际版本号）：

```sh
docker pull ghcr.io/hstarorg/moto-assistant-backend:latest

docker run -d --name moto-assistant-backend --restart unless-stopped \
  -e DATABASE_URL -e WECHAT_CONFIG -e R2_CONFIG \
  -e WECHAT_VPAY_CONFIG \
  -p 7410:7410 ghcr.io/hstarorg/moto-assistant-backend:latest
```

服务启动后可通过 `/api/v1/health` 检查状态。
