# 微信小程序虚拟支付客户端

该目录封装微信个人主体小程序虚拟支付服务端协议，包括：

- 生成 `wx.requestVirtualPayment` 所需的 `signData`、`paySig` 和 `signature`。
- 调用 `/xpay/query_order` 主动查询并校验微信订单。
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
否则服务端无法验签和解密 `echostr`，微信后台会提示验证失败。

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

| 枚举成员                    | `error.code`                    | 含义                         |
| --------------------------- | ------------------------------- | ---------------------------- |
| `ACCESS_TOKEN_FAILED`       | `WVP_ACCESS_TOKEN_FAILED`       | 获取微信 access_token 失败   |
| `INVALID_ENCODING_AES_KEY`  | `WVP_INVALID_ENCODING_AES_KEY`  | EncodingAESKey 格式不正确    |
| `QUERY_REQUEST_FAILED`      | `WVP_QUERY_REQUEST_FAILED`      | 查单网络请求失败             |
| `QUERY_RESPONSE_INVALID`    | `WVP_QUERY_RESPONSE_INVALID`    | 查单响应无法解析             |
| `QUERY_FAILED`              | `WVP_QUERY_FAILED`              | 微信查单接口返回业务错误     |
| `QUERY_ORDER_INVALID`       | `WVP_QUERY_ORDER_INVALID`       | 微信订单与本地预期不一致     |
| `MESSAGE_SIGNATURE_INVALID` | `WVP_MESSAGE_SIGNATURE_INVALID` | 消息签名缺失或校验失败       |
| `MESSAGE_DECRYPT_FAILED`    | `WVP_MESSAGE_DECRYPT_FAILED`    | 安全模式消息解密失败         |
| `MESSAGE_PADDING_INVALID`   | `WVP_MESSAGE_PADDING_INVALID`   | 解密消息的 PKCS#7 填充不正确 |
| `MESSAGE_FORMAT_INVALID`    | `WVP_MESSAGE_FORMAT_INVALID`    | 解密消息结构不正确           |
| `MESSAGE_APP_ID_MISMATCH`   | `WVP_MESSAGE_APP_ID_MISMATCH`   | 消息内 AppID 与配置不匹配    |
