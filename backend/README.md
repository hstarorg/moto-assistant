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

单笔赞赏上限固定为 200 元，单用户十分钟内最多创建 5 个待支付订单。消息推送
固定使用安全模式。生产环境必须使用 `production` 和现网 AppKey。

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
