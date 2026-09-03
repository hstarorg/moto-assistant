import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TipOrderEntity } from '../database';
import type { ThirdPartyService } from './third-party.service';
import { WechatVirtualPaymentService } from './wechat-virtual-payment.service';

describe('WechatVirtualPaymentService', () => {
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

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('builds deterministic payment parameters with the documented signatures', () => {
    const service = createService();

    expect(service.createPaymentParameters(order, 'session-key')).toEqual({
      mode: 'short_series_goods',
      paySig:
        'a1d3e03c9f7bcf6cf43150c83f7cd2e88e028bc79a6d4d15eb3561c510ba3853',
      signData:
        '{"offerId":"offer-123","buyQuantity":5,"env":0,"currencyType":"CNY","productId":"zanshang","goodsPrice":100,"outTradeNo":"MA1234567890ABCDEF","attach":"MA1234567890ABCDEF"}',
      signature:
        '3e335df9dd72aa7d1d96f6adedafc837206744fe171380c903b13a7276c2a616',
    });
  });

  it('queries and validates the authoritative order from WeChat', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          errcode: 0,
          errmsg: 'ok',
          order: {
            env_type: 1,
            order_fee: 500,
            order_id: order.outTradeNo,
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

    await expect(createService().queryOrder(order)).resolves.toEqual({
      orderFee: 500,
      orderId: order.outTradeNo,
      paidFee: 500,
      paidTime: 1700000000,
      refundFee: 0,
      status: 2,
      wxOrderId: 'wx-order-1',
    });
    const [requestUrl, request] = fetchMock.mock.calls[0];
    expect(requestUrl).toBeInstanceOf(URL);
    if (!(requestUrl instanceof URL)) {
      throw new Error('微信查单地址类型不正确');
    }
    expect(requestUrl.pathname).toBe('/xpay/query_order');
    expect(requestUrl.searchParams.get('access_token')).toBe('access-token');
    expect(requestUrl.searchParams.get('pay_sig')).toHaveLength(64);
    expect(request).toEqual({
      body: `{"openid":"openid-1","env":0,"order_id":"${order.outTradeNo}"}`,
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
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
