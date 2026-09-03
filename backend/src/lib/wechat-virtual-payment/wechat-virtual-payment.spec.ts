import { createCipheriv, createHash } from 'node:crypto';
import {
  WechatVirtualPayment,
  type WechatVirtualPaymentConfig,
  WechatVirtualPaymentErrorCode,
  WechatVirtualPaymentError,
} from './index';

describe('WechatVirtualPayment', () => {
  const aesKey = Buffer.from('0123456789abcdef0123456789abcdef');
  const config: WechatVirtualPaymentConfig = {
    appId: 'wx-test-app-id',
    appKey: 'app-key',
    encodingAesKey: aesKey.toString('base64').replace(/=$/u, ''),
    environment: 0,
    messageToken: 'message-token',
    offerId: 'offer-123',
  };

  it('builds deterministic payment parameters', () => {
    const client = createClient();

    expect(
      client.createPaymentParameters({
        outTradeNo: 'MA1234567890ABCDEF',
        productId: 'tip_1_cny',
        quantity: 5,
        sessionKey: 'session-key',
        unitPrice: 100,
      }),
    ).toEqual({
      mode: 'short_series_goods',
      paySig:
        'ca9ebb8e315b0cc77dec382a3c2a672aac49c2bf9907cf617583d7131a306b45',
      signData:
        '{"offerId":"offer-123","buyQuantity":5,"env":0,"currencyType":"CNY","productId":"tip_1_cny","goodsPrice":100,"outTradeNo":"MA1234567890ABCDEF","attach":"MA1234567890ABCDEF"}',
      signature:
        '32db63d6bbf5d671715035cbf4055785ac215db07ca117b3ecb0043028f60228',
    });
  });

  it('exposes stable error codes independently from error messages', () => {
    const action = () =>
      new WechatVirtualPayment(
        { ...config, encodingAesKey: 'invalid' },
        { getAccessToken: jest.fn().mockResolvedValue('access-token') },
      );

    let thrown: unknown;
    try {
      action();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(WechatVirtualPaymentError);
    expect(thrown).toMatchObject({
      code: WechatVirtualPaymentErrorCode.INVALID_ENCODING_AES_KEY,
    });
  });

  it('maps upstream WeChat errors to a stable SDK error code', async () => {
    const client = new WechatVirtualPayment(config, {
      fetch: jest
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ errcode: -1, errmsg: 'system error from WeChat' }),
            { headers: { 'Content-Type': 'application/json' }, status: 200 },
          ),
        ) as typeof fetch,
      getAccessToken: jest.fn().mockResolvedValue('access-token'),
    });

    await expect(
      client.queryOrder({
        openId: 'openid-1',
        orderId: 'MA1234567890ABCDEF',
        totalAmount: 500,
      }),
    ).rejects.toMatchObject({
      code: WechatVirtualPaymentErrorCode.QUERY_FAILED,
    });
  });

  it('actively queries and validates the authoritative order', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          errcode: 0,
          errmsg: 'ok',
          order: {
            env_type: 1,
            order_fee: 500,
            order_id: 'MA1234567890ABCDEF',
            paid_fee: 500,
            paid_time: 1700000000,
            refund_fee: 0,
            status: 2,
            wx_order_id: 'wx-order-1',
          },
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 200 },
      ),
    );
    const getAccessToken = jest.fn().mockResolvedValue('access-token');
    const client = new WechatVirtualPayment(config, {
      fetch: fetchMock as typeof fetch,
      getAccessToken,
    });

    await expect(
      client.queryOrder({
        openId: 'openid-1',
        orderId: 'MA1234567890ABCDEF',
        totalAmount: 500,
      }),
    ).resolves.toEqual({
      orderFee: 500,
      orderId: 'MA1234567890ABCDEF',
      paidFee: 500,
      paidTime: 1700000000,
      refundFee: 0,
      status: 2,
      wxOrderId: 'wx-order-1',
    });
    expect(getAccessToken).toHaveBeenCalledTimes(1);
    const [requestUrl, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(requestUrl.pathname).toBe('/xpay/query_order');
    expect(requestUrl.searchParams.get('access_token')).toBe('access-token');
    expect(requestUrl.searchParams.get('pay_sig')).toHaveLength(64);
    expect(request).toEqual({
      body: '{"openid":"openid-1","env":0,"order_id":"MA1234567890ABCDEF"}',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
  });

  it('decrypts a safe-mode message and validates its embedded AppID', () => {
    const timestamp = '1700000000';
    const nonce = 'nonce-2';
    const message = JSON.stringify({ Event: 'xpay_goods_deliver_notify' });
    const encrypted = encrypt(message, config.appId);
    const signature = createHash('sha1')
      .update(
        [config.messageToken, timestamp, nonce, encrypted].sort().join(''),
      )
      .digest('hex');

    expect(
      createClient().decryptMessage(encrypted, signature, timestamp, nonce),
    ).toBe(message);
  });

  it('rejects a message encrypted for another AppID', () => {
    const timestamp = '1700000000';
    const nonce = 'nonce-3';
    const encrypted = encrypt('{}', 'wx-another-app');
    const signature = createHash('sha1')
      .update(
        [config.messageToken, timestamp, nonce, encrypted].sort().join(''),
      )
      .digest('hex');

    try {
      createClient().decryptMessage(encrypted, signature, timestamp, nonce);
      throw new Error('应拒绝不匹配的 AppID');
    } catch (error) {
      expect(error).toBeInstanceOf(WechatVirtualPaymentError);
      expect(error).toMatchObject({
        code: WechatVirtualPaymentErrorCode.MESSAGE_APP_ID_MISMATCH,
      });
    }
  });

  function createClient(): WechatVirtualPayment {
    return new WechatVirtualPayment(config, {
      getAccessToken: jest.fn().mockResolvedValue('access-token'),
    });
  }

  function encrypt(message: string, targetAppId: string): string {
    const messageBuffer = Buffer.from(message, 'utf8');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(messageBuffer.length);
    const packed = Buffer.concat([
      Buffer.alloc(16, 1),
      length,
      messageBuffer,
      Buffer.from(targetAppId, 'utf8'),
    ]);
    const paddingLength = 32 - (packed.length % 32);
    const padded = Buffer.concat([
      packed,
      Buffer.alloc(paddingLength, paddingLength),
    ]);
    const cipher = createCipheriv(
      'aes-256-cbc',
      aesKey,
      aesKey.subarray(0, 16),
    );
    cipher.setAutoPadding(false);
    return Buffer.concat([cipher.update(padded), cipher.final()]).toString(
      'base64',
    );
  }
});
