# 微信小程序虚拟支付客户端

该目录封装微信个人主体小程序虚拟支付服务端协议，包括：

- 生成 `wx.requestVirtualPayment` 所需的 `signData`、`paySig` 和 `signature`。
- 调用 `/xpay/query_order` 主动查询并校验微信订单。
- 主动查询退款单，并区分支付单与退款单。
- 调用 `/xpay/notify_provide_goods` 完成异常情况下的发货确认。
- 验证、解密微信消息安全模式报文。

该客户端不依赖 NestJS、TypeORM 或具体数据库，可以在不同 Node.js 服务端应用中复用。
它不是普通微信支付 APIv3 SDK，也不处理商户号、商户证书或 APIv3 Key。

## 创建客户端

```ts
import { WechatVirtualPayment } from './lib/wechat-virtual-payment';

const client = new WechatVirtualPayment(
  {
    appId: 'wx...',
    appKey: '...',
    encodingAesKey: '43 位 EncodingAESKey',
    environment: 1,
    messageToken: '...',
    offerId: '...',
  },
  {
    getAccessToken: async () => getWechatAccessToken(),
    // 可选：传回被拒绝的旧 token，由应用层使匹配的缓存失效并合并并发刷新。
    refreshAccessToken: async rejectedToken => getWechatAccessToken(rejectedToken),
    // fetch 可选，默认使用 globalThis.fetch。
    fetch,
  },
);
```

`environment` 的取值为：

- `0`：生产环境。
- `1`：沙箱环境。

`getAccessToken` 由接入应用实现，客户端不会读取应用配置、缓存或持久化
`access_token`。调用方也可以注入 `fetch`，用于设置代理、超时策略或测试替身。

提供可选的 `refreshAccessToken(rejectedToken)` 后，微信返回 40001、40014、42001 时，
SDK 刷新一次 token 并用完全相同的请求体重试一次。再次失败则抛出 `ACCESS_TOKEN_INVALID`；
未提供刷新回调时直接抛出该错误。其他业务错误和超时不会自动重发。
应用层应只使与 `rejectedToken` 相同的缓存失效：若已有更新的 token，复用新值；同一进程
的并发刷新应共用一个进行中的请求。SDK 不持久化任何 token，也不提供分布式缓存。

## `messageToken` 和 `encodingAesKey` 从哪里来

这两个值属于小程序的**消息推送配置**，用于验证和解密微信发到业务服务器的事件，
不是虚拟支付基本配置中的 OfferID、AppKey，也不是小程序 AppSecret 或微信支付
APIv3 Key。

使用与 `appId` 对应的同一个小程序账号登录[微信公众平台](https://mp.weixin.qq.com/)，
进入「开发」→「开发管理」→「开发设置」→「消息推送」，点击启用或修改，然后填写：

| 微信后台字段                  | SDK 配置字段        | 获取或生成方式                                                                 |
| ----------------------------- | ------------------- | ------------------------------------------------------------------------------ |
| URL（服务器地址）             | 不属于 SDK 配置     | 填写本应用公开可访问的 `https://<API域名>/api/v1/wechat/messages`              |
| Token（令牌）                 | `messageToken`      | 由开发者自行生成并填写，建议使用 32 位随机字母和数字；把完全相同的值配置到服务端 |
| EncodingAESKey（消息加密密钥） | `encodingAesKey`    | 在该页面点击“随机生成”获得 43 位字符串；把完全相同的值配置到服务端             |

本项目的回调实现只支持以下选择：

- 消息加密方式：**安全模式**。
- 数据格式：**JSON**。

首次保存时，微信会向上述 URL 发起验证请求。应先将服务端部署到公网 HTTPS 地址，配置好
`appId`、`messageToken` 和 `encodingAesKey` 并启动服务，再在微信后台保存消息推送配置；
GET 验证请求使用 `signature`：对 Token、timestamp、nonce 排序拼接后计算 SHA-1，
验签通过后原样返回 `echostr`，不对 `echostr` 进行 AES 解密。POST 安全模式消息才使用
`msg_signature` 和 EncodingAESKey 验签、解密。

两个值必须与微信后台逐字符一致，不要添加引号、空格或换行。它们是服务端密钥，不能
提交到仓库、下发到小程序、打印到日志或暴露在错误响应中。更换其中任意一个值时，微信
后台和服务端配置必须同步更新。

## 主要接口

### `createPaymentParameters(input)`

根据 OfferID、AppKey 和微信登录返回的 `session_key` 生成小程序调起虚拟支付所需参数。
返回值可以直接映射到 `wx.requestVirtualPayment`。

### `queryOrder(input)`

主动调用微信 `/xpay/query_order`，并校验订单号、环境和订单金额。微信 webhook
只能作为触发查单的提醒，不能作为支付或退款结果的数据源；业务状态必须以该接口的
返回结果为准。

返回值包含 `orderType`（0：普通支付，7：Apple 支付）和 `leftFee`（原支付单剩余可退金额）。
该接口只接受支付单，退款单应使用 `queryRefundOrder`，避免将退款流水写入支付流水字段。
微信支付单未返回 `refund_fee` 时，SDK 将 `refundFee` 归一为 0；显式返回的非法值仍会拒绝。
退款单不适用此缺省规则，必须返回有效的正整数退款金额，且不能超过原支付金额。

### `queryRefundOrder(input)`

使用本地订单的 `openId` 和回调中用于定位的 `orderId`（MchRefundId）或 `wxOrderId`
（WxRefundId）主动查询退款单；两者至少提供一个。`totalAmount` 为原支付单金额。
SDK 校验退款单号、环境、订单类型（1：普通退款，8：Apple 退款）和退款金额范围。
回调中的 RefundFee、RetCode 和退款时间不作为事实来源。

退款状态 5 仅表示商户扣款完成，状态 7 表示退款失败，只有状态 8 表示用户已收到退款。
业务层还须核对原支付单的剩余金额与支付渠道，不能仅凭回调或一笔退款查询修改任意支付单。
本应用只在全额退款完成并核对原单 `leftFee=0` 后标记 `refunded`；部分退款仍保持 `paid`，
`refundedAt` 表示服务端首次确认全额退款完成的时间。

### `notifyProvideGoods(orderId)`

仅在主动查单确认付款且本地业务事务提交后调用。该接口按官方协议只携带 access_token，
不添加 pay_sig。正常发货推送已成功应答时无需额外调用；推送丢失或确认失败时用于补偿。
查询到状态 4（已发货）后不再发送确认。微信网络请求设置 5 秒超时，失败由调用方重试。
该超时覆盖 HTTP 请求与响应体读取；自定义 `getAccessToken` / `refreshAccessToken` 回调
应由接入应用保证有界。本项目的微信登录和 token HTTP 请求同样设置 5 秒超时。

### `verifyUrlSignature(signature, timestamp, nonce)`

验证首次 GET URL 校验签名，失败使用 `MESSAGE_SIGNATURE_INVALID`；成功后由调用方
原样返回请求中的 echostr。协议参见[微信消息推送文档](https://developers.weixin.qq.com/miniprogram/dev/framework/server-ability/message-push.html)。

### `decryptMessage(encrypted, signature, timestamp, nonce)`

按微信消息安全模式验证 `msg_signature`，使用 EncodingAESKey 解密消息并校验报文内
AppID。这里的 AES-256-CBC、IV 和 PKCS#7 规则来自微信消息协议，不能替换成普通微信
支付 APIv3 回调使用的 AES-GCM。

## 错误处理与兼容约定

客户端抛出的协议错误都是 `WechatVirtualPaymentError`。SDK 不提供面向用户的错误
文案，调用方必须通过稳定的 `error.code` 分支处理，并在应用层自行映射文案：

```ts
import {
  WechatVirtualPaymentError,
  WechatVirtualPaymentErrorCode,
} from './lib/wechat-virtual-payment';

try {
  await client.queryOrder(input);
} catch (error) {
  if (
    error instanceof WechatVirtualPaymentError &&
    error.code === WechatVirtualPaymentErrorCode.QUERY_FAILED
  ) {
    // 按业务需要重试或返回统一错误。
  }
}
```

错误码是跨应用兼容契约：已有错误码不会改变含义或复用给其他场景。用户可见文案不
属于 SDK 公共接口，由各应用按产品语境和语言自行维护。后续版本可能增加新的错误码，
调用方应为未知错误保留兜底逻辑。

微信返回可解析的数值错误码时，错误还携带可选的 `upstreamCode`，仅用于服务端诊断。
SDK 不保存微信原始 errmsg、请求 URL、签名或密钥；面向用户的接口仍只返回应用层错误码
与文案。应用层应记录操作名、业务订单号、SDK code 和 upstreamCode，不记录完整 Error 或报文。

| 枚举成员                    | `error.code`                    | 含义                         |
| --------------------------- | ------------------------------- | ---------------------------- |
| `ACCESS_TOKEN_FAILED`       | `WVP_ACCESS_TOKEN_FAILED`       | 获取微信 access_token 失败   |
| `ACCESS_TOKEN_INVALID`      | `WVP_ACCESS_TOKEN_INVALID`      | token 被拒绝且未配置刷新或一次刷新后仍失效 |
| `REQUEST_TIMEOUT`           | `WVP_REQUEST_TIMEOUT`           | 微信 HTTP 请求或响应体读取超时 |
| `INVALID_ENCODING_AES_KEY`  | `WVP_INVALID_ENCODING_AES_KEY`  | EncodingAESKey 格式不正确    |
| `QUERY_REQUEST_FAILED`      | `WVP_QUERY_REQUEST_FAILED`      | 查单网络请求失败             |
| `QUERY_RESPONSE_INVALID`    | `WVP_QUERY_RESPONSE_INVALID`    | 查单响应无法解析             |
| `QUERY_FAILED`              | `WVP_QUERY_FAILED`              | 微信查单接口返回业务错误     |
| `QUERY_ORDER_INVALID`       | `WVP_QUERY_ORDER_INVALID`       | 微信订单与本地预期不一致     |
| `PROVIDE_REQUEST_FAILED`    | `WVP_PROVIDE_REQUEST_FAILED`    | 发货确认网络请求失败         |
| `PROVIDE_RESPONSE_INVALID`  | `WVP_PROVIDE_RESPONSE_INVALID`  | 发货确认响应无法解析         |
| `PROVIDE_FAILED`            | `WVP_PROVIDE_FAILED`            | 微信发货确认接口返回业务错误 |
| `MESSAGE_SIGNATURE_INVALID` | `WVP_MESSAGE_SIGNATURE_INVALID` | 消息签名缺失或校验失败       |
| `MESSAGE_DECRYPT_FAILED`    | `WVP_MESSAGE_DECRYPT_FAILED`    | 安全模式消息解密失败         |
| `MESSAGE_PADDING_INVALID`   | `WVP_MESSAGE_PADDING_INVALID`   | 解密消息的 PKCS#7 填充不正确 |
| `MESSAGE_FORMAT_INVALID`    | `WVP_MESSAGE_FORMAT_INVALID`    | 解密消息结构不正确           |
| `MESSAGE_APP_ID_MISMATCH`   | `WVP_MESSAGE_APP_ID_MISMATCH`   | 消息内 AppID 与配置不匹配    |
