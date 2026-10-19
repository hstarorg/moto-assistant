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
  refreshAccessToken?: (rejectedToken: string) => Promise<string>;
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
  leftFee?: number;
  orderFee: number;
  orderId: string;
  orderType: number;
  paidFee: number;
  paidTime: number;
  refundFee: number;
  status: number;
  wxOrderId?: string;
}

export interface WechatVirtualPaymentRefundQueryInput {
  openId: string;
  orderId?: string;
  totalAmount: number;
  wxOrderId?: string;
}

interface WechatVirtualPaymentQueryOrderResponse {
  errcode?: number;
  errmsg?: string;
  order?: {
    env_type?: number;
    order_fee?: number;
    order_id?: string;
    order_type?: number;
    left_fee?: number;
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
    const result = await this.query({
      openid: input.openId,
      env: this.config.environment,
      order_id: input.orderId,
    });
    const order = this.parseOrder(result);
    if (
      order.orderId !== input.orderId ||
      order.orderFee !== input.totalAmount ||
      ![0, 7].includes(order.orderType) ||
      order.leftFee === undefined ||
      order.leftFee > order.paidFee
    ) {
      throw new WechatVirtualPaymentError(
        WechatVirtualPaymentErrorCode.QUERY_ORDER_INVALID,
      );
    }
    return order;
  }

  async queryRefundOrder(
    input: WechatVirtualPaymentRefundQueryInput,
  ): Promise<WechatVirtualPaymentOrder> {
    if (!input.orderId && !input.wxOrderId) {
      throw new WechatVirtualPaymentError(
        WechatVirtualPaymentErrorCode.QUERY_ORDER_INVALID,
      );
    }
    const result = await this.query({
      openid: input.openId,
      env: this.config.environment,
      ...(input.orderId
        ? { order_id: input.orderId }
        : { wx_order_id: input.wxOrderId }),
    });
    const order = this.parseOrder(result);
    if (
      (input.orderId && order.orderId !== input.orderId) ||
      (input.wxOrderId && order.wxOrderId !== input.wxOrderId) ||
      ![1, 8].includes(order.orderType) ||
      order.refundFee <= 0 ||
      order.refundFee > input.totalAmount ||
      (order.status === 8 && order.paidTime <= 0)
    ) {
      throw new WechatVirtualPaymentError(
        WechatVirtualPaymentErrorCode.QUERY_ORDER_INVALID,
      );
    }
    return order;
  }

  async notifyProvideGoods(orderId: string): Promise<void> {
    await this.request(
      '/xpay/notify_provide_goods',
      { order_id: orderId, env: this.config.environment },
      {
        failed: WechatVirtualPaymentErrorCode.PROVIDE_FAILED,
        request: WechatVirtualPaymentErrorCode.PROVIDE_REQUEST_FAILED,
        response: WechatVirtualPaymentErrorCode.PROVIDE_RESPONSE_INVALID,
      },
      false,
    );
  }

  verifyUrlSignature(
    signature: string | undefined,
    timestamp: string | undefined,
    nonce: string | undefined,
  ): void {
    this.verifyMessageSignature(signature, [
      this.config.messageToken,
      timestamp,
      nonce,
    ]);
  }

  private async query(
    body: Record<string, unknown>,
  ): Promise<WechatVirtualPaymentQueryOrderResponse> {
    const result = await this.request('/xpay/query_order', body, {
      failed: WechatVirtualPaymentErrorCode.QUERY_FAILED,
      request: WechatVirtualPaymentErrorCode.QUERY_REQUEST_FAILED,
      response: WechatVirtualPaymentErrorCode.QUERY_RESPONSE_INVALID,
    });
    return result;
  }

  private async request(
    path: string,
    body: Record<string, unknown>,
    codes: {
      failed: WechatVirtualPaymentErrorCode;
      request: WechatVirtualPaymentErrorCode;
      response: WechatVirtualPaymentErrorCode;
    },
    signed = true,
  ): Promise<Record<string, unknown>> {
    const requestBody = JSON.stringify(body);
    let accessToken: string;
    try {
      accessToken = await this.dependencies.getAccessToken();
    } catch {
      throw new WechatVirtualPaymentError(
        WechatVirtualPaymentErrorCode.ACCESS_TOKEN_FAILED,
      );
    }
    for (let attempt = 0; ; attempt += 1) {
      const result = await this.send(
        path,
        requestBody,
        accessToken,
        codes,
        signed,
      );
      const upstreamCode = Number.isSafeInteger(result.errcode)
        ? (result.errcode as number)
        : undefined;
      if ([40001, 40014, 42001].includes(upstreamCode ?? 0)) {
        if (attempt === 0 && this.dependencies.refreshAccessToken) {
          try {
            accessToken =
              await this.dependencies.refreshAccessToken(accessToken);
          } catch {
            throw new WechatVirtualPaymentError(
              WechatVirtualPaymentErrorCode.ACCESS_TOKEN_FAILED,
            );
          }
          continue;
        }
        throw new WechatVirtualPaymentError(
          WechatVirtualPaymentErrorCode.ACCESS_TOKEN_INVALID,
          upstreamCode,
        );
      }
      if (upstreamCode !== 0) {
        throw new WechatVirtualPaymentError(codes.failed, upstreamCode);
      }
      return result;
    }
  }

  private async send(
    path: string,
    requestBody: string,
    accessToken: string,
    codes: {
      request: WechatVirtualPaymentErrorCode;
      response: WechatVirtualPaymentErrorCode;
    },
    signed: boolean,
  ): Promise<Record<string, unknown>> {
    const url = new URL(path, 'https://api.weixin.qq.com');
    url.search = new URLSearchParams({
      access_token: accessToken,
      ...(signed
        ? {
            pay_sig: this.hmacSha256(
              this.config.appKey,
              `${path}&${requestBody}`,
            ),
          }
        : {}),
    }).toString();

    const signal = AbortSignal.timeout(5000);
    let response: Response;
    try {
      response = await this.fetch(url, {
        body: requestBody,
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        signal,
      });
    } catch {
      throw new WechatVirtualPaymentError(
        signal.aborted
          ? WechatVirtualPaymentErrorCode.REQUEST_TIMEOUT
          : codes.request,
      );
    }
    if (!response.ok) {
      throw new WechatVirtualPaymentError(codes.request);
    }

    let result: unknown;
    try {
      result = await response.json();
    } catch {
      throw new WechatVirtualPaymentError(
        signal.aborted
          ? WechatVirtualPaymentErrorCode.REQUEST_TIMEOUT
          : codes.response,
      );
    }
    if (
      typeof result !== 'object' ||
      result === null ||
      Array.isArray(result)
    ) {
      throw new WechatVirtualPaymentError(codes.response);
    }
    return result as Record<string, unknown>;
  }

  private parseOrder(
    result: WechatVirtualPaymentQueryOrderResponse,
  ): WechatVirtualPaymentOrder {
    const order = result.order;
    if (!order || typeof order !== 'object') {
      throw new WechatVirtualPaymentError(
        WechatVirtualPaymentErrorCode.QUERY_FAILED,
      );
    }
    if (
      order.env_type !== this.config.environment + 1 ||
      typeof order.order_id !== 'string' ||
      !order.order_id ||
      !Number.isSafeInteger(order.order_type) ||
      !Number.isSafeInteger(order.order_fee) ||
      (order.order_fee ?? -1) < 0 ||
      typeof order.status !== 'number' ||
      !Number.isSafeInteger(order.status) ||
      typeof order.paid_fee !== 'number' ||
      !Number.isSafeInteger(order.paid_fee) ||
      order.paid_fee < 0 ||
      typeof order.refund_fee !== 'number' ||
      !Number.isSafeInteger(order.refund_fee) ||
      order.refund_fee < 0 ||
      typeof order.paid_time !== 'number' ||
      !Number.isSafeInteger(order.paid_time) ||
      order.paid_time < 0 ||
      (order.left_fee !== undefined &&
        (!Number.isSafeInteger(order.left_fee) || order.left_fee < 0)) ||
      (order.wx_order_id !== undefined && typeof order.wx_order_id !== 'string')
    ) {
      throw new WechatVirtualPaymentError(
        WechatVirtualPaymentErrorCode.QUERY_ORDER_INVALID,
      );
    }

    return {
      leftFee: order.left_fee,
      orderFee: order.order_fee as number,
      orderId: order.order_id,
      orderType: order.order_type as number,
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
