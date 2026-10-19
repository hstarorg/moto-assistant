import {
  observedPaidOrder,
  officialJsonMessage,
  paymentSigningVector,
  querySigningVectors,
} from '../../../test/fixtures/wechat-virtual-payment';
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

  it('matches an independent signing vector using the session_key text, not decoded bytes', () => {
    const client = createClient();

    expect(
      client.createPaymentParameters({
        outTradeNo: 'MA1234567890ABCDEF',
        productId: 'zanshang',
        quantity: 5,
        sessionKey: paymentSigningVector.sessionKey,
        unitPrice: 100,
      }),
    ).toEqual({
      mode: 'short_series_goods',
      paySig: paymentSigningVector.paySig,
      signData: paymentSigningVector.signData,
      signature: paymentSigningVector.signature,
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

  it.each(querySigningVectors)(
    'signs the exact query body in environment $environment and reads the sanitized response',
    async ({ environment, body, paySig }) => {
      // Only env_type is adapted for the synthetic sandbox variant.
      const fetchMock = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ...observedPaidOrder,
            order: {
              ...observedPaidOrder.order,
              env_type: environment + 1,
            },
          }),
          { headers: { 'Content-Type': 'application/json' }, status: 200 },
        ),
      );
      const getAccessToken = jest.fn().mockResolvedValue('access-token');
      const client = new WechatVirtualPayment(
        { ...config, environment },
        {
          fetch: fetchMock as typeof fetch,
          getAccessToken,
        },
      );

      await expect(
        client.queryOrder({
          openId: 'openid-1',
          orderId: 'MA1234567890ABCDEF',
          totalAmount: 100,
        }),
      ).resolves.toEqual({
        leftFee: 100,
        orderFee: 100,
        orderId: 'MA1234567890ABCDEF',
        orderType: 0,
        paidFee: 100,
        paidTime: 1792397607,
        refundFee: 0,
        status: 3,
        wxOrderId: 'wx-order-redacted',
      });
      expect(getAccessToken).toHaveBeenCalledTimes(1);
      const [requestUrl, request] = fetchMock.mock.calls[0] as [
        URL,
        RequestInit,
      ];
      expect(requestUrl.pathname).toBe('/xpay/query_order');
      expect(requestUrl.searchParams.get('access_token')).toBe('access-token');
      expect(requestUrl.origin).toBe('https://api.weixin.qq.com');
      expect(requestUrl.searchParams.get('pay_sig')).toBe(paySig);
      expect(request).toEqual({
        body,
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        signal: request.signal,
      });
      expect(request.signal).toBeInstanceOf(AbortSignal);
    },
  );

  it.each([
    { env_type: 2 },
    { order_id: 'MAOTHER12345678' },
    { order_fee: 101 },
    { order_type: 1, refund_fee: 100 },
    { left_fee: 101 },
  ])(
    'rejects a mismatched authoritative payment: %p',
    async (changedFields) => {
      const client = new WechatVirtualPayment(config, {
        fetch: jest.fn().mockResolvedValue(
          Response.json({
            ...observedPaidOrder,
            order: { ...observedPaidOrder.order, ...changedFields },
          }),
        ) as typeof fetch,
        getAccessToken: jest.fn().mockResolvedValue('access-token'),
      });
      await expect(
        client.queryOrder({
          openId: 'openid-1',
          orderId: 'MA1234567890ABCDEF',
          totalAmount: 100,
        }),
      ).rejects.toMatchObject({
        code: WechatVirtualPaymentErrorCode.QUERY_ORDER_INVALID,
      });
    },
  );

  it.each([0, 7])(
    'accepts payment type %i without a refund_fee field',
    async (orderType) => {
      const client = new WechatVirtualPayment(config, {
        fetch: jest.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              errcode: 0,
              order: {
                env_type: 1,
                order_id: 'MA1234567890ABCDEF',
                order_type: orderType,
                order_fee: 100,
                paid_fee: 100,
                paid_time: 1700000000,
                left_fee: 100,
                status: 3,
                wx_order_id: 'wx-order-1',
              },
            }),
          ),
        ) as typeof fetch,
        getAccessToken: jest.fn().mockResolvedValue('access-token'),
      });

      await expect(
        client.queryOrder({
          openId: 'openid-1',
          orderId: 'MA1234567890ABCDEF',
          totalAmount: 100,
        }),
      ).resolves.toMatchObject({
        orderType,
        status: 3,
        paidFee: 100,
        refundFee: 0,
      });
    },
  );

  it.each([null, -1, 0.5, '0'])(
    'rejects an explicitly invalid payment refund_fee: %p',
    async (refundFee) => {
      const client = new WechatVirtualPayment(config, {
        fetch: jest.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              errcode: 0,
              order: {
                env_type: 1,
                order_id: 'MA1234567890ABCDEF',
                order_type: 0,
                order_fee: 100,
                paid_fee: 100,
                paid_time: 1700000000,
                left_fee: 100,
                status: 3,
                refund_fee: refundFee,
              },
            }),
          ),
        ) as typeof fetch,
        getAccessToken: jest.fn().mockResolvedValue('access-token'),
      });
      await expect(
        client.queryOrder({
          openId: 'openid-1',
          orderId: 'MA1234567890ABCDEF',
          totalAmount: 100,
        }),
      ).rejects.toMatchObject({
        code: WechatVirtualPaymentErrorCode.QUERY_ORDER_INVALID,
      });
    },
  );

  it.each([1, 8])(
    'requires a positive valid refund_fee for refund type %i',
    async (orderType) => {
      for (const refundFee of [undefined, null, 0, -1, 0.5, '100', 101]) {
        const client = new WechatVirtualPayment(config, {
          fetch: jest.fn().mockResolvedValue(
            new Response(
              JSON.stringify({
                errcode: 0,
                order: {
                  env_type: 1,
                  order_id: 'REFUND12345678',
                  order_type: orderType,
                  order_fee: 0,
                  paid_fee: 0,
                  paid_time: 1700000000,
                  status: 8,
                  refund_fee: refundFee,
                },
              }),
            ),
          ) as typeof fetch,
          getAccessToken: jest.fn().mockResolvedValue('access-token'),
        });
        await expect(
          client.queryRefundOrder({
            openId: 'openid-1',
            orderId: 'REFUND12345678',
            totalAmount: 100,
          }),
        ).rejects.toMatchObject({
          code: WechatVirtualPaymentErrorCode.QUERY_ORDER_INVALID,
        });
      }
    },
  );

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
    // Synthetic refund scenario from documented types/fields, NOT a captured
    // refund response. Zero payment amounts here are inputs, not a provider rule.
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

  it.each([
    [0, 'a0691dc36196b63575ed3d7c3fd938cf0cf2d8aafe016295812843f13d670cca'],
    [1, 'cf27e0027eb087a14b62f180754b38dc9f94ee0ea72ce3b2a2ef242404ade7f0'],
  ] as const)(
    'signs delivery confirmation for environment %i',
    async (environment, expectedPaySig) => {
      const fetchMock = jest
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ errcode: 0 })));
      const client = new WechatVirtualPayment(
        { ...config, environment },
        {
          fetch: fetchMock as typeof fetch,
          getAccessToken: jest.fn().mockResolvedValue('access-token'),
        },
      );
      await client.notifyProvideGoods('MA1234567890ABCDEF');
      const [url, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe('/xpay/notify_provide_goods');
      expect(url.searchParams.get('access_token')).toBe('access-token');
      expect(url.searchParams.get('pay_sig')).toBe(expectedPaySig);
      expect(JSON.parse(request.body as string)).toEqual({
        order_id: 'MA1234567890ABCDEF',
        env: environment,
      });
    },
  );

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

  it('preserves observed delivery error 268490002 without exposing or interpreting errmsg', async () => {
    const client = new WechatVirtualPayment(config, {
      // Selected code from both live no-order probes. The same code was used
      // for missing pay_sig AND missing order identifiers; it is not specific.
      fetch: jest
        .fn()
        .mockResolvedValue(
          Response.json({ errcode: 268490002 }),
        ) as typeof fetch,
      getAccessToken: jest.fn().mockResolvedValue('access-token'),
    });
    await expect(
      client.notifyProvideGoods('MA1234567890ABCDEF'),
    ).rejects.toMatchObject({
      code: WechatVirtualPaymentErrorCode.PROVIDE_FAILED,
      upstreamCode: 268490002,
      message: '',
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
      expect(firstUrl.searchParams.get('pay_sig')).toBe(
        'a0691dc36196b63575ed3d7c3fd938cf0cf2d8aafe016295812843f13d670cca',
      );
      expect(secondUrl.searchParams.get('pay_sig')).toBe(
        firstUrl.searchParams.get('pay_sig'),
      );
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

  it.each(['headers', 'body'] as const)(
    'bounds a real stalled HTTP %s read without relying on a pre-aborted mock',
    async (stalledStage) => {
      const server = createServer((_request, response) => {
        if (stalledStage === 'body') {
          response.writeHead(200, { 'Content-Type': 'application/json' });
          response.flushHeaders();
          response.write('{');
        }
        // Intentionally never finish headers/body; the real AbortSignal must fire.
      });
      await new Promise<void>((resolve) =>
        server.listen(0, '127.0.0.1', resolve),
      );
      try {
        const address = server.address();
        if (!address || typeof address === 'string')
          throw new Error('Missing test server port');
        const client = new WechatVirtualPayment(config, {
          // Redirect only the external HTTP boundary to a loopback fault server.
          fetch: (_url, init) =>
            globalThis.fetch(`http://127.0.0.1:${address.port}`, init),
          getAccessToken: jest.fn().mockResolvedValue('access-token'),
        });
        await expect(
          client.notifyProvideGoods('MA1234567890ABCDEF'),
        ).rejects.toMatchObject({
          code: WechatVirtualPaymentErrorCode.REQUEST_TIMEOUT,
          message: '',
        });
      } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
    },
    10_000,
  );

  it('decrypts the official JSON safe-mode worked example without a local encoder', () => {
    const client = new WechatVirtualPayment(
      { ...config, ...officialJsonMessage },
      { getAccessToken: jest.fn() },
    );

    expect(
      client.decryptMessage(
        officialJsonMessage.encrypted,
        officialJsonMessage.signature,
        officialJsonMessage.timestamp,
        officialJsonMessage.nonce,
      ),
    ).toBe(officialJsonMessage.plaintext);
  });

  it('rejects the same official ciphertext with a different configured AppID', () => {
    const client = new WechatVirtualPayment(
      { ...config, ...officialJsonMessage, appId: 'wx-another-app' },
      { getAccessToken: jest.fn() },
    );

    try {
      client.decryptMessage(
        officialJsonMessage.encrypted,
        officialJsonMessage.signature,
        officialJsonMessage.timestamp,
        officialJsonMessage.nonce,
      );
      throw new Error('应拒绝不匹配的 AppID');
    } catch (error) {
      expect(error).toBeInstanceOf(WechatVirtualPaymentError);
      expect(error).toMatchObject({
        code: WechatVirtualPaymentErrorCode.MESSAGE_APP_ID_MISMATCH,
      });
    }
  });

  it('rejects a safe-mode message signed with signature instead of msg_signature', () => {
    const client = new WechatVirtualPayment(
      { ...config, ...officialJsonMessage },
      { getAccessToken: jest.fn() },
    );
    expect(() =>
      client.decryptMessage(
        officialJsonMessage.encrypted,
        '6c5c811b55cc85e0e1b54100749188c20beb3f5d',
        officialJsonMessage.timestamp,
        officialJsonMessage.nonce,
      ),
    ).toThrow(WechatVirtualPaymentError);
  });

  function createClient(): WechatVirtualPayment {
    return new WechatVirtualPayment(config, {
      getAccessToken: jest.fn().mockResolvedValue('access-token'),
    });
  }
});
import { createServer } from 'node:http';
