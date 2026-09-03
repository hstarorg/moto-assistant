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
        'ca9ebb8e315b0cc77dec382a3c2a672aac49c2bf9907cf617583d7131a306b45',
      signData:
        '{"offerId":"offer-123","buyQuantity":5,"env":0,"currencyType":"CNY","productId":"zanshang","goodsPrice":100,"outTradeNo":"MA1234567890ABCDEF","attach":"MA1234567890ABCDEF"}',
      signature:
        '32db63d6bbf5d671715035cbf4055785ac215db07ca117b3ecb0043028f60228',
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
