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
        productId: 'zanshang',
        quantity: 5,
        sessionKey: 'session-key',
        unitPrice: 100,
      }),
    ).toEqual({
      mode: 'short_series_goods',
      paySig:
        'a1d3e03c9f7bcf6cf43150c83f7cd2e88e028bc79a6d4d15eb3561c510ba3853',
      signData:
        '{"offerId":"offer-123","buyQuantity":5,"env":0,"currencyType":"CNY","productId":"zanshang","goodsPrice":100,"outTradeNo":"MA1234567890ABCDEF","attach":"MA1234567890ABCDEF"}',
      signature:
        '3e335df9dd72aa7d1d96f6adedafc837206744fe171380c903b13a7276c2a616',
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
            order_type: 0,
            left_fee: 500,
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
      leftFee: 500,
      orderFee: 500,
      orderId: 'MA1234567890ABCDEF',
      orderType: 0,
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
      signal: request.signal,
    });
    expect(request.signal).toBeInstanceOf(AbortSignal);
  });

  it('verifies the official plaintext URL challenge signature', () => {
    const client = new WechatVirtualPayment(
      { ...config, messageToken: 'AAAAA' },
      { getAccessToken: jest.fn() },
    );
    expect(() =>
      client.verifyUrlSignature(
        'f464b24fc39322e44b38aa78f5edd27bd1441696',
        '1714036504',
        '1514711492',
      ),
    ).not.toThrow();
    for (const signature of [undefined, 'invalid']) {
      expect(() =>
        client.verifyUrlSignature(signature, '1714036504', '1514711492'),
      ).toThrow(WechatVirtualPaymentError);
    }
  });

  it('queries refund ids separately and validates their type and amount', async () => {
    const refund = {
      env_type: 1,
      order_fee: 0,
      order_id: 'REFUND12345678',
      order_type: 1,
      paid_fee: 0,
      paid_time: 1700000100,
      refund_fee: 500,
      status: 8,
      wx_order_id: 'wx-refund-1',
    };
    const fetchMock = jest
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ errcode: 0, order: refund })),
        ),
      );
    const client = new WechatVirtualPayment(config, {
      fetch: fetchMock as typeof fetch,
      getAccessToken: jest.fn().mockResolvedValue('access-token'),
    });
    const input = {
      openId: 'openid-1',
      wxOrderId: 'wx-refund-1',
      totalAmount: 500,
    };
    await expect(client.queryRefundOrder(input)).resolves.toMatchObject({
      orderType: 1,
      refundFee: 500,
      status: 8,
    });
    const [, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(JSON.parse(request.body as string)).toEqual({
      openid: 'openid-1',
      env: 0,
      wx_order_id: 'wx-refund-1',
    });
    refund.refund_fee = 501;
    await expect(client.queryRefundOrder(input)).rejects.toMatchObject({
      code: WechatVirtualPaymentErrorCode.QUERY_ORDER_INVALID,
    });
    refund.refund_fee = 500;
    refund.order_type = 0;
    await expect(client.queryRefundOrder(input)).rejects.toMatchObject({
      code: WechatVirtualPaymentErrorCode.QUERY_ORDER_INVALID,
    });
    refund.order_type = 1;
    refund.env_type = 2;
    await expect(client.queryRefundOrder(input)).rejects.toMatchObject({
      code: WechatVirtualPaymentErrorCode.QUERY_ORDER_INVALID,
    });
  });

  it('confirms delivery with the documented token-only API', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ errcode: 0 })));
    const client = new WechatVirtualPayment(config, {
      fetch: fetchMock as typeof fetch,
      getAccessToken: jest.fn().mockResolvedValue('access-token'),
    });
    await client.notifyProvideGoods('MA1234567890ABCDEF');
    const [url, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe('/xpay/notify_provide_goods');
    expect(url.searchParams.get('access_token')).toBe('access-token');
    expect(url.searchParams.has('pay_sig')).toBe(false);
    expect(JSON.parse(request.body as string)).toEqual({
      order_id: 'MA1234567890ABCDEF',
      env: 0,
    });
  });

  it('rejects failed delivery confirmations with an SDK error code', async () => {
    const client = new WechatVirtualPayment(config, {
      fetch: jest
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ errcode: -1 })),
        ) as typeof fetch,
      getAccessToken: jest.fn().mockResolvedValue('access-token'),
    });
    await expect(
      client.notifyProvideGoods('MA1234567890ABCDEF'),
    ).rejects.toMatchObject({
      code: WechatVirtualPaymentErrorCode.PROVIDE_FAILED,
    });
  });

  it.each([40001, 40014, 42001])(
    'refreshes token code %s once and resends the same delivery request',
    async (errcode) => {
      const fetchMock = jest
        .fn()
        .mockImplementationOnce(() =>
          Promise.resolve(new Response(JSON.stringify({ errcode }))),
        )
        .mockImplementationOnce(() =>
          Promise.resolve(new Response(JSON.stringify({ errcode: 0 }))),
        );
      const refreshAccessToken = jest.fn().mockResolvedValue('new-token');
      const client = new WechatVirtualPayment(config, {
        fetch: fetchMock as typeof fetch,
        getAccessToken: jest.fn().mockResolvedValue('old-token'),
        refreshAccessToken,
      });
      await client.notifyProvideGoods('MA1234567890ABCDEF');
      expect(refreshAccessToken).toHaveBeenCalledWith('old-token');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const [firstUrl, firstRequest] = fetchMock.mock.calls[0] as [
        URL,
        RequestInit,
      ];
      const [secondUrl, secondRequest] = fetchMock.mock.calls[1] as [
        URL,
        RequestInit,
      ];
      expect(firstUrl.searchParams.get('access_token')).toBe('old-token');
      expect(secondUrl.searchParams.get('access_token')).toBe('new-token');
      expect(secondRequest.body).toBe(firstRequest.body);
    },
  );

  it('stops after one unsuccessful refresh without leaking an upstream message', async () => {
    const fetchMock = jest
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ errcode: 42001, errmsg: 'private-upstream-data' }),
          ),
        ),
      );
    const refreshAccessToken = jest.fn().mockResolvedValue('new-token');
    const client = new WechatVirtualPayment(config, {
      fetch: fetchMock as typeof fetch,
      getAccessToken: jest.fn().mockResolvedValue('old-token'),
      refreshAccessToken,
    });
    await expect(
      client.notifyProvideGoods('MA1234567890ABCDEF'),
    ).rejects.toMatchObject({
      code: WechatVirtualPaymentErrorCode.ACCESS_TOKEN_INVALID,
      upstreamCode: 42001,
      message: '',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
  });

  it('does not refresh or retry unrelated business errors', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ errcode: -1 })));
    const refreshAccessToken = jest.fn();
    const client = new WechatVirtualPayment(config, {
      fetch: fetchMock as typeof fetch,
      getAccessToken: jest.fn().mockResolvedValue('access-token'),
      refreshAccessToken,
    });
    await expect(
      client.notifyProvideGoods('MA1234567890ABCDEF'),
    ).rejects.toMatchObject({
      code: WechatVirtualPaymentErrorCode.PROVIDE_FAILED,
      upstreamCode: -1,
    });
    expect(refreshAccessToken).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails once when the optional token refresh callback is absent', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ errcode: 42001 })));
    const client = new WechatVirtualPayment(config, {
      fetch: fetchMock as typeof fetch,
      getAccessToken: jest.fn().mockResolvedValue('old-token'),
    });
    await expect(
      client.notifyProvideGoods('MA1234567890ABCDEF'),
    ).rejects.toMatchObject({
      code: WechatVirtualPaymentErrorCode.ACCESS_TOKEN_INVALID,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports timeouts with a stable code and does not retry a possibly executed request', async () => {
    const timeout = jest
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(AbortSignal.abort());
    const fetchMock = jest
      .fn()
      .mockRejectedValue(new Error('private-network-data'));
    const client = new WechatVirtualPayment(config, {
      fetch: fetchMock as typeof fetch,
      getAccessToken: jest.fn().mockResolvedValue('access-token'),
    });
    try {
      await expect(
        client.notifyProvideGoods('MA1234567890ABCDEF'),
      ).rejects.toMatchObject({
        code: WechatVirtualPaymentErrorCode.REQUEST_TIMEOUT,
        message: '',
      });
      expect(timeout).toHaveBeenCalledWith(5000);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      timeout.mockRestore();
    }
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
