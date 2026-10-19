# 支付测试核查（2026-10-19）

## 范围与结论

核查 SDK、微信适配服务、登录/token、消息路由、赞赏订单、补偿任务、HTTP + PostgreSQL 集成测试，以及小程序支付页面、支付封装和 AJAX 测试。

此前的关键问题是测试预期缺少独立来源。Mock 和实现可以一起犯错；真实数据库的集成测试也不等于已通过微信验收。本轮保留业务策略测试，但不再用它们证明微信协议兼容。

测试边界沿用现有公开接口：SDK 方法、HTTP API、小程序支付封装及页面动作。未执行真实付款、退款、发货操作，未读取或修改业务数据库。

## 找到并修正的薄弱点

| 原测试问题 | 本轮处理 | 独立依据 / 验证范围 |
| --- | --- | --- |
| 查单样本人为填满所有字段，默认有 `refund_fee: 0` | SDK、适配层、HTTP 回放同一份脱敏响应，保留 `refund_fee` 缺失；增加订单号、金额、类型、环境、剩余金额不匹配的拒绝场景 | 实际生产查单观测 + query_order 字段语义 |
| 查单签名只断言 64 位；发货模拟器仅检查签名存在 | 查单两个环境使用独立固定签名；模拟器验证路径和原始请求体的完整 HMAC，错误签名不能成功发货 | 官方签名规则 + Python 独立向量；发货签名要求另有实测依据 |
| 加解密测试自行生成密文，与解密实现可能共享同一误解 | 替换为官方完整 JSON 密文、`msg_signature` 和明文；同一密文测试错误 AppID、错用 `signature`；HTTP 层也回放官方密文 | 官方消息推送完整算例，不调用本项目加密器生成预期 |
| 支付回调模拟使用未在协议列出的顶层 `PaidFee` | 改用 `GoodsInfo`、`WeChatPayInfo` 中的文档字段，故意放入错误值并验证仍主动查单 | 官方虚拟支付 §2.4 的字段定义；错误值是明确的负向输入 |
| “事务提交后发货”测试只观察 mock `save` 被调用 | 原单测改名为孤立策略测试；新增真实 PostgreSQL 提交前失败注入，经 HTTP 验证回滚、未发货、之后可恢复 | 本项目先提交后确认发货的业务要求，非微信承诺 |
| 小程序页面 mock 自己的支付封装，并复制其重试错误码 | 页面加载真实封装，只模拟原生 wx 支付边界；覆盖参数透传、能力不支持、取消、签名和 session 错误 | wx.requestVirtualPayment 参数和错误码表 |
| 数值错误码被包含 `cancel` 的文案覆盖 | 新回归先失败，随后修正为明确数值码优先；只有没有错误码时保留文案兼容 | 文档明确 `-2` 为取消，`-15010` 为道具未发布；冲突文案是合成负向输入，不声称来自微信 |
| 预先 abort 的 mock 只能验证错误分类，不能证明响应体读取有界 | 保留分类测试，增加本地真实 HTTP 连接，分别卡住响应头和 JSON 响应体，等待真实 AbortSignal 超时 | 本项目 5 秒超时策略；不是伪造的微信响应 |
| 固定脱敏微信单号隐含“每次测试数据库都是空的” | 同一临时库重复运行暴露唯一约束冲突；HTTP 回放为本轮订单替换两个脱敏标识，业务金额、状态和字段缺失保持不变 | 微信单号全局唯一的本项目约束；不清空测试库掩盖冲突 |

## 证据来源与样本边界

### 1. 微信官方协议

本轮直接读取以下官方页面（2026-10-19）：

- [个人主体接入](https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/business-capabilities/virtual-payment/person.html)：道具直购、`requestVirtualPayment&signData`、sessionKey 文本签名。
- [虚拟支付总文档](https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/business-capabilities/virtual-payment.html)：§2.4 回调字段和 JSON 成功应答；§2.5/2.6 HMAC 算法。
- [query_order](https://developers.weixin.qq.com/miniprogram/dev/server/API/VirtualPayment/api_query_order.html)：请求 env 为 0/1，返回 env_type 为 1/2；类型 0/7 是支付，1/8 是退款；状态 5 是商户侧扣款，7 是退款失败，8 才是用户收款；`refund_fee` 描述针对退款单，`left_fee` 针对支付单。
- [消息推送](https://developers.weixin.qq.com/miniprogram/dev/framework/server-ability/message-push.html)：GET 验证算例、JSON 安全模式完整密文与明文、SHA-1 / AES-256-CBC / 32 字节填充 / AppID 校验。
- [wx.requestVirtualPayment](https://developers.weixin.qq.com/miniprogram/dev/api/payment/wx.requestVirtualPayment.html)：signData 必须按字符串传递，`-15005` 为用户态签名错误，`-15006` 为支付签名错误，`-15007` 为 session_key 过期。

官方 JSON 样本是 `debug_demo`，不是支付事件。用于证明加密传输与解析兼容，不能据此声称已收到过真实支付推送。

### 2. 本会话此前实际查单的脱敏投影

`backend/test/fixtures/wechat-virtual-payment.ts` 的 `observedPaidOrder` 保存 2026-10-19 实际生产查单中已记录的字段：HTTP 200、errcode 0、env_type 1、order_type 0、status 3、order_fee/paid_fee/left_fee 均 100、paid_time 1792397607，且没有 `refund_fee`。

这不是完整原始响应：仅保存当时确认过的字段，订单号和微信单号已替换，不补写未记录的 errmsg、token、其他字段。普通支付生产回放使用此投影；沙箱 env_type、iOS 类型等变体均为文档推导的合成场景，不冒充实测。

### 3. 发货接口的文档遗漏与实测

[notify_provide_goods 当前参数表](https://developers.weixin.qq.com/miniprogram/dev/server/API/VirtualPayment/api_notify_provide_goods.html)没有列出 pay_sig，不能据此推断不需要签名。

本会话此前用空订单号、没有真实目标的请求做过验证：

- 不带签名：HTTP 200，errcode `268490002`，错误提示指向 pay_sig 为空。
- 同样的空订单请求带正确签名：仍为 `268490002`，错误提示改为 order_id / wx_order_id 为空。

这里只保留错误码及已确认的提示含义，没有保存完整 errmsg，也不伪造“脱敏原始报文”。同一个错误码可有不同原因，SDK 仅透传 upstreamCode，不按该码断言唯一根因。这组结果支持必须签名，**不等于完整发货成功验收**。

### 4. 签名向量的复核

fixture 中的 HMAC 向量用 Python 标准库按官方算法独立计算，不调用 SDK，不从 SDK 输出反填。所有密钥都是公开示例或测试占位值。

复核公式：

```python
import hashlib, hmac
pay_sig = hmac.new(app_key.encode(), (uri + '&' + raw_body).encode(), hashlib.sha256).hexdigest()
signature = hmac.new(session_key.encode(), raw_body.encode(), hashlib.sha256).hexdigest()
```

本组 AppKey 是 `app-key`。支付端 uri 为 `requestVirtualPayment`；session_key 使用公开示例 `9hAb/NEYUlkaMBEsmFgzig==` 的字符串字节，不能 Base64 解码后签名。查单 uri 为 `/xpay/query_order`，两个原始 body 和预期签名均存于 fixture。

## 保留但不冒充协议事实的测试

- `tip.service.spec.ts`：归一化 SDK 结果驱动的孤立业务策略。仓储、支付协作者仍有 mock；不用于证明微信报文、行锁或提交行为。关键路径另有真实服务 + PostgreSQL 的 HTTP 测试。
- `wechat-message.service.spec.ts`：消息分发和拒绝策略，不证明加解密；加密兼容由官方向量及 HTTP 回放证明。
- `tip-reconciliation.service.spec.ts`：禁用、不重入、游标恢复等本项目调度策略，不是微信调度保证。
- `third-party.service.spec.ts`：token 并发刷新、失败恢复、超时分类、敏感信息隔离。token 协议字段采用占位值，不冒充实际 token 响应。
- 小程序的恢复存储、24 小时过期、有限轮询、一次 session 重试、金额范围、错误文案，均属于本项目策略；wx 回调不是付款事实源。页面测试仍以合成的后端响应、登录状态驱动，不冒充前后端真机联调。
- 退款样本为文档字段与状态构造的场景，**尚无真实退款响应**。样本中 order_fee/paid_fee 取 0 或其他值只为构造输入，不表示微信退款单恒定返回这些值。退款金额正整数、不得超过原支付、跨渠道拒绝是安全校验；全额退款才变为 refunded 是产品规则。

## 尚不能证明的事项

1. 缺少真实未支付、关闭、普通退款、iOS 支付/退款及实际支付推送的脱敏样本。未臆测这些场景的字段缺省规则；获得样本后追加，不用全字段 mock 代替现场验收。
2. 本轮 E2E 是真实应用、HTTP、SDK、PostgreSQL + 微信边界模拟器，仍需真机/正式小额订单走支付 → 推送 → 查单 → 发货状态 → 账单核对。任何退款与真实发货须单独获授权。
3. 当前发布工作流 `.github/workflows/backend-image.yml` 没有强制执行测试。本轮未改发布流程；本地通过不代表以后发布有门禁。

## 本地验证

后端执行单测、只读 ESLint、构建；小程序执行测试及类型检查。支付 HTTP 集成测试只使用新建的本机临时 PostgreSQL，数据库名以 `moto_payment_e2e_` 开头；不会使用 `.env` 中的业务数据库。

最终结果：后端 67 条单测、11 条集成测试（含 10 条支付用例）通过，小程序 23 条测试通过；ESLint、后端构建及小程序类型检查通过。新增的小程序错误码优先级回归经历了先失败、最小修正后通过的验证；其他协议测试主要是用独立证据替换预期、补足覆盖，不将原本已通过的情况虚称为 red → green。

```sh
# backend，E2E URL 必须指向专用可丢弃测试库
pnpm exec jest --runInBand
pnpm exec eslint "{src,apps,libs,test}/**/*.ts"
pnpm build
E2E_DATABASE_URL='<专用测试库 URL>' pnpm test:e2e payment.e2e-spec.ts

# micro-app
pnpm test
pnpm typecheck
```
