import {
  createDecipheriv,
  createHash,
  createHmac,
  timingSafeEqual,
} from 'node:crypto';
import { WechatVirtualPaymentErrorCode } from './error-codes';
import { WechatVirtualPaymentError } from './wechat-virtual-payment.error';

export interface WechatVirtualPaymentConfig {
  appId: string;
  appKey: string;
  encodingAesKey: string;
  environment: 0 | 1;
  messageToken: string;
  offerId: string;
}

export interface WechatVirtualPaymentDependencies {
  fetch?: typeof globalThis.fetch;
  getAccessToken: () => Promise<string>;
}

export interface WechatVirtualPaymentInput {
  outTradeNo: string;
  productId: string;
  quantity: number;
  sessionKey: string;
  unitPrice: number;
}

export interface WechatVirtualPaymentParameters {
  mode: 'short_series_goods';
  paySig: string;
  signData: string;
  signature: string;
}

export interface WechatVirtualPaymentQueryInput {
  openId: string;
  orderId: string;
  totalAmount: number;
}

export interface WechatVirtualPaymentOrder {
  orderFee: number;
  orderId: string;
  paidFee: number;
  paidTime: number;
  refundFee: number;
  status: number;
  wxOrderId?: string;
}

interface WechatVirtualPaymentQueryOrderResponse {
  errcode?: number;
  errmsg?: string;
  order?: {
    env_type?: number;
    order_fee?: number;
    order_id?: string;
    paid_fee?: number;
    paid_time?: number;
    refund_fee?: number;
    status?: number;
    wx_order_id?: string;
  };
}

export class WechatVirtualPayment {
  private readonly aesKey: Buffer;
  private readonly fetch: typeof globalThis.fetch;

  constructor(
    private readonly config: WechatVirtualPaymentConfig,
    private readonly dependencies: WechatVirtualPaymentDependencies,
  ) {
    this.aesKey = Buffer.from(`${config.encodingAesKey}=`, 'base64');
    if (config.encodingAesKey.length !== 43 || this.aesKey.length !== 32) {
      throw new WechatVirtualPaymentError(
        WechatVirtualPaymentErrorCode.INVALID_ENCODING_AES_KEY,
      );
    }
    this.fetch = dependencies.fetch ?? globalThis.fetch.bind(globalThis);
  }

  createPaymentParameters(
    input: WechatVirtualPaymentInput,
  ): WechatVirtualPaymentParameters {
    const signData = JSON.stringify({
      offerId: this.config.offerId,
      buyQuantity: input.quantity,
      env: this.config.environment,
      currencyType: 'CNY',
      productId: input.productId,
      goodsPrice: input.unitPrice,
      outTradeNo: input.outTradeNo,
      attach: input.outTradeNo,
    });

    return {
      mode: 'short_series_goods',
      paySig: this.hmacSha256(
        this.config.appKey,
        `requestVirtualPayment&${signData}`,
      ),
      signData,
      signature: this.hmacSha256(input.sessionKey, signData),
    };
  }

  async queryOrder(
    input: WechatVirtualPaymentQueryInput,
  ): Promise<WechatVirtualPaymentOrder> {
    const requestBody = JSON.stringify({
      openid: input.openId,
      env: this.config.environment,
      order_id: input.orderId,
    });
    const paySig = this.hmacSha256(
      this.config.appKey,
      `/xpay/query_order&${requestBody}`,
    );
    let accessToken: string;
    try {
      accessToken = await this.dependencies.getAccessToken();
    } catch {
      throw new WechatVirtualPaymentError(
        WechatVirtualPaymentErrorCode.ACCESS_TOKEN_FAILED,
      );
    }
    const url = new URL('https://api.weixin.qq.com/xpay/query_order');
    url.search = new URLSearchParams({
      access_token: accessToken,
      pay_sig: paySig,
    }).toString();

    let response: Response;
    try {
      response = await this.fetch(url, {
        body: requestBody,
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
    } catch {
      throw new WechatVirtualPaymentError(
        WechatVirtualPaymentErrorCode.QUERY_REQUEST_FAILED,
      );
    }
    if (!response.ok) {
      throw new WechatVirtualPaymentError(
        WechatVirtualPaymentErrorCode.QUERY_REQUEST_FAILED,
      );
    }

    let result: WechatVirtualPaymentQueryOrderResponse;
    try {
      result =
        (await response.json()) as WechatVirtualPaymentQueryOrderResponse;
    } catch {
      throw new WechatVirtualPaymentError(
        WechatVirtualPaymentErrorCode.QUERY_RESPONSE_INVALID,
      );
    }
    const order = result.order;
    if (result.errcode !== 0 || !order) {
      throw new WechatVirtualPaymentError(
        WechatVirtualPaymentErrorCode.QUERY_FAILED,
      );
    }
    if (
      order.order_id !== input.orderId ||
      order.env_type !== this.config.environment + 1 ||
      order.order_fee !== input.totalAmount ||
      typeof order.status !== 'number' ||
      !Number.isSafeInteger(order.status) ||
      typeof order.paid_fee !== 'number' ||
      !Number.isSafeInteger(order.paid_fee) ||
      typeof order.refund_fee !== 'number' ||
      !Number.isSafeInteger(order.refund_fee) ||
      typeof order.paid_time !== 'number' ||
      !Number.isSafeInteger(order.paid_time)
    ) {
      throw new WechatVirtualPaymentError(
        WechatVirtualPaymentErrorCode.QUERY_ORDER_INVALID,
      );
    }

    return {
      orderFee: order.order_fee,
      orderId: order.order_id,
      paidFee: order.paid_fee,
      paidTime: order.paid_time,
      refundFee: order.refund_fee,
      status: order.status,
      wxOrderId: order.wx_order_id,
    };
  }

  decryptMessage(
    encrypted: string,
    signature: string | undefined,
    timestamp: string | undefined,
    nonce: string | undefined,
  ): string {
    this.verifyMessageSignature(signature, [
      this.config.messageToken,
      timestamp,
      nonce,
      encrypted,
    ]);

    let decrypted: Buffer;
    try {
      const decipher = createDecipheriv(
        'aes-256-cbc',
        this.aesKey,
        this.aesKey.subarray(0, 16),
      );
      decipher.setAutoPadding(false);
      decrypted = Buffer.concat([
        decipher.update(Buffer.from(encrypted, 'base64')),
        decipher.final(),
      ]);
    } catch {
      throw new WechatVirtualPaymentError(
        WechatVirtualPaymentErrorCode.MESSAGE_DECRYPT_FAILED,
      );
    }

    return this.unpackMessage(this.removePkcs7Padding(decrypted));
  }

  private hmacSha256(key: string, value: string): string {
    return createHmac('sha256', key).update(value, 'utf8').digest('hex');
  }

  private verifyMessageSignature(
    signature: string | undefined,
    values: Array<string | undefined>,
  ): void {
    if (!signature || values.some((value) => !value)) {
      throw new WechatVirtualPaymentError(
        WechatVirtualPaymentErrorCode.MESSAGE_SIGNATURE_INVALID,
      );
    }

    const expected = createHash('sha1')
      .update([...values].sort().join(''), 'utf8')
      .digest('hex');
    const receivedBuffer = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    if (
      receivedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(receivedBuffer, expectedBuffer)
    ) {
      throw new WechatVirtualPaymentError(
        WechatVirtualPaymentErrorCode.MESSAGE_SIGNATURE_INVALID,
      );
    }
  }

  private removePkcs7Padding(value: Buffer): Buffer {
    const paddingLength = value.at(-1);
    if (
      paddingLength === undefined ||
      paddingLength < 1 ||
      paddingLength > 32 ||
      value.length < paddingLength
    ) {
      throw new WechatVirtualPaymentError(
        WechatVirtualPaymentErrorCode.MESSAGE_PADDING_INVALID,
      );
    }
    for (
      let index = value.length - paddingLength;
      index < value.length;
      index += 1
    ) {
      if (value[index] !== paddingLength) {
        throw new WechatVirtualPaymentError(
          WechatVirtualPaymentErrorCode.MESSAGE_PADDING_INVALID,
        );
      }
    }
    return value.subarray(0, value.length - paddingLength);
  }

  private unpackMessage(value: Buffer): string {
    if (value.length < 20) {
      throw new WechatVirtualPaymentError(
        WechatVirtualPaymentErrorCode.MESSAGE_FORMAT_INVALID,
      );
    }
    const messageLength = value.readUInt32BE(16);
    const messageStart = 20;
    const messageEnd = messageStart + messageLength;
    if (messageEnd > value.length) {
      throw new WechatVirtualPaymentError(
        WechatVirtualPaymentErrorCode.MESSAGE_FORMAT_INVALID,
      );
    }

    const appId = value.subarray(messageEnd).toString('utf8');
    if (appId !== this.config.appId) {
      throw new WechatVirtualPaymentError(
        WechatVirtualPaymentErrorCode.MESSAGE_APP_ID_MISMATCH,
      );
    }
    return value.subarray(messageStart, messageEnd).toString('utf8');
  }
}
