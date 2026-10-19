import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  observedPaidOrder,
  paymentSigningVector,
} from '../../test/fixtures/wechat-virtual-payment';
import type { TipOrderEntity } from '../database';
import type { ThirdPartyService } from './third-party.service';
import { WechatVirtualPaymentService } from './wechat-virtual-payment.service';

describe('WechatVirtualPaymentService', () => {
  let warnings: jest.SpyInstance;
  const encodingAesKey = Buffer.from('0123456789abcdef0123456789abcdef')
    .toString('base64')
    .replace(/=$/u, '');
  const thirdParty = {
    getWechatAccessToken: jest.fn().mockResolvedValue('access-token'),
  };
  const order = {
    environment: 0,
    outTradeNo: 'MA1234567890ABCDEF',
    payerOpenId: 'openid-1',
    productId: 'zanshang',
    quantity: 5,
    totalAmount: 500,
    unitPrice: 100,
  } as TipOrderEntity;

  const createService = (environment = 'production') =>
    new WechatVirtualPaymentService(
      new ConfigService({
        WECHAT_CONFIG: 'wx-test-app-id|app-secret',
        WECHAT_VPAY_CONFIG: `offer-123|app-key|${environment}|message-token|${encodingAesKey}`,
      }),
      thirdParty as unknown as ThirdPartyService,
    );

  beforeEach(() => {
    thirdParty.getWechatAccessToken
      .mockReset()
      .mockResolvedValue('access-token');
    warnings = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('builds deterministic payment parameters with the documented signatures', () => {
    const service = createService();

    expect(
      service.createPaymentParameters(order, paymentSigningVector.sessionKey),
    ).toEqual({
      mode: 'short_series_goods',
      paySig: paymentSigningVector.paySig,
      signData: paymentSigningVector.signData,
      signature: paymentSigningVector.signature,
    });
  });

  it('queries and validates the authoritative order from WeChat', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(observedPaidOrder), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    );

    await expect(
      createService().queryOrder({ ...order, totalAmount: 100 }),
    ).resolves.toEqual({
      leftFee: 100,
      orderFee: 100,
      orderId: order.outTradeNo,
      orderType: 0,
      paidFee: 100,
      paidTime: 1792397607,
      refundFee: 0,
      status: 3,
      wxOrderId: 'wx-order-redacted',
    });
    const [requestUrl, request] = fetchMock.mock.calls[0];
    expect(requestUrl).toBeInstanceOf(URL);
    if (!(requestUrl instanceof URL)) {
      throw new Error('微信查单地址类型不正确');
    }
    expect(requestUrl.pathname).toBe('/xpay/query_order');
    expect(requestUrl.searchParams.get('access_token')).toBe('access-token');
    expect(requestUrl.searchParams.get('pay_sig')).toBe(
      '38ab22a630e019649ca9d4bcc9b217764c8f9e255d2a9e9bcf95cb41331b7d30',
    );
    expect(request).toEqual({
      body: `{"openid":"openid-1","env":0,"order_id":"${order.outTradeNo}"}`,
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      signal: request?.signal,
    });
    expect(request?.signal).toBeInstanceOf(AbortSignal);
  });

  it('keeps the feature unavailable when the combined config is empty', () => {
    const service = new WechatVirtualPaymentService(
      new ConfigService({ WECHAT_VPAY_CONFIG: '' }),
      thirdParty as unknown as ThirdPartyService,
    );

    expect(() => service.createPaymentParameters(order, 'session-key')).toThrow(
      ServiceUnavailableException,
    );
  });

  it('rejects old-environment orders for signing, queries and delivery without calling WeChat', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    const service = createService();
    const oldOrder = { ...order, environment: 1 };
    expect(() =>
      service.createPaymentParameters(oldOrder, 'session-key'),
    ).toThrow('该订单不属于当前支付环境，请重新发起');
    for (const promise of [
      service.queryOrder(oldOrder),
      service.queryRefundOrder(oldOrder, { orderId: 'REFUND12345678' }),
      service.notifyProvideGoods(oldOrder),
    ]) {
      await expect(promise).rejects.toMatchObject({
        response: { code: 'TIP_ORDER_ENVIRONMENT_MISMATCH' },
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(thirdParty.getWechatAccessToken).not.toHaveBeenCalled();
  });

  it('refreshes a rejected token once and logs only numeric or stable error codes', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementationOnce(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ errcode: 42001, errmsg: 'secret-token' }),
          ),
        ),
      )
      .mockImplementationOnce(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ errcode: 40001, errmsg: 'secret-key' }),
          ),
        ),
      );
    thirdParty.getWechatAccessToken
      .mockResolvedValueOnce('old-token')
      .mockResolvedValueOnce('new-token');
    await expect(createService().queryOrder(order)).rejects.toMatchObject({
      response: { code: 'TIP_ORDER_QUERY_FAILED' },
    });
    expect(thirdParty.getWechatAccessToken).toHaveBeenNthCalledWith(
      2,
      'old-token',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(warnings).toHaveBeenCalledWith(
      JSON.stringify({
        event: 'wechat_virtual_payment_failure',
        operation: 'query_order',
        orderNo: order.outTradeNo,
        code: 'WVP_ACCESS_TOKEN_INVALID',
        upstreamCode: 40001,
      }),
    );
    const logged = JSON.stringify(warnings.mock.calls);
    expect(logged).not.toContain('secret-');
    expect(logged).not.toContain('old-token');
    expect(logged).not.toContain('new-token');
  });

  it('rejects a sandbox configuration in production', () => {
    expect(
      () =>
        new WechatVirtualPaymentService(
          new ConfigService({
            NODE_ENV: 'production',
            WECHAT_CONFIG: 'wx-test-app-id|app-secret',
            WECHAT_VPAY_CONFIG: `offer-123|sandbox-key|sandbox|message-token|${encodingAesKey}`,
          }),
          thirdParty as unknown as ThirdPartyService,
        ),
    ).toThrow('生产环境不能启用微信虚拟支付沙箱配置');
  });
});
