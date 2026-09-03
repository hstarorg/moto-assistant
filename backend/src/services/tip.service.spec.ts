import { TipOrderStatus } from '../constants';
import type { TipOrderEntity } from '../database';
import { TipService } from './tip.service';

describe('TipService order creation', () => {
  it('creates a server-controlled one-yuan item order', async () => {
    const createdAt = new Date('2026-09-03T00:00:00.000Z');
    const tipOrders = {
      countBy: jest.fn().mockResolvedValue(0),
      create: jest.fn((value: Record<string, unknown>) => ({
        ...value,
        createdAt,
      })),
      findOneBy: jest.fn().mockResolvedValue(null),
      save: jest.fn((value: TipOrderEntity) => Promise.resolve(value)),
    };
    const users = {
      findOneBy: jest.fn().mockResolvedValue({ id: 7, openId: 'openid-7' }),
    };
    const thirdParty = {
      getWechatSession: jest.fn().mockResolvedValue({
        openId: 'openid-7',
        sessionKey: 'session-key',
      }),
    };
    const virtualPayment = {
      assertEnabled: jest.fn(),
      createPaymentParameters: jest.fn().mockReturnValue({
        mode: 'short_series_goods',
        paySig: 'pay-signature',
        signData: '{}',
        signature: 'user-signature',
      }),
      getEnvironment: jest.fn().mockReturnValue(0),
      getMaximumPendingOrderCount: jest.fn().mockReturnValue(5),
      getMaximumTipAmountYuan: jest.fn().mockReturnValue(200),
    };
    const service = new TipService(
      tipOrders as never,
      users as never,
      {} as never,
      thirdParty as never,
      virtualPayment as never,
    );

    const response = await service.createOrder(7, {
      amountYuan: 5,
      clientRequestId: '12345678-1234-1234-1234-123456789012',
      loginCode: 'one-time-code',
    });

    expect(tipOrders.create).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: 0,
        payerOpenId: 'openid-7',
        productId: 'zanshang',
        quantity: 5,
        status: TipOrderStatus.PENDING,
        totalAmount: 500,
        unitPrice: 100,
        userId: 7,
      }),
    );
    expect(response.orderNo).toMatch(/^MA[A-Z0-9]{20,30}$/u);
    expect(response).toEqual({
      amountYuan: 5,
      orderNo: response.orderNo,
      payment: {
        mode: 'short_series_goods',
        paySig: 'pay-signature',
        signData: '{}',
        signature: 'user-signature',
      },
    });
  });

  it('returns the existing order for the same globally unique request id', async () => {
    const existing = {
      clientRequestId: '12345678-1234-1234-1234-123456789012',
      outTradeNo: 'MA12345678',
      status: TipOrderStatus.PENDING,
      totalAmount: 500,
      userId: 7,
    } as TipOrderEntity;
    const tipOrders = {
      findOneBy: jest.fn().mockResolvedValue(existing),
    };
    const users = {
      findOneBy: jest.fn().mockResolvedValue({ id: 7, openId: 'openid-7' }),
    };
    const thirdParty = {
      getWechatSession: jest.fn().mockResolvedValue({
        openId: 'openid-7',
        sessionKey: 'session-key',
      }),
    };
    const virtualPayment = {
      assertEnabled: jest.fn(),
      createPaymentParameters: jest.fn().mockReturnValue({
        mode: 'short_series_goods',
        paySig: 'pay-signature',
        signData: '{}',
        signature: 'user-signature',
      }),
      getMaximumTipAmountYuan: jest.fn().mockReturnValue(200),
    };
    const service = new TipService(
      tipOrders as never,
      users as never,
      {} as never,
      thirdParty as never,
      virtualPayment as never,
    );

    const response = await service.createOrder(7, {
      amountYuan: 5,
      clientRequestId: existing.clientRequestId,
      loginCode: 'one-time-code',
    });

    expect(tipOrders.findOneBy).toHaveBeenCalledWith({
      clientRequestId: existing.clientRequestId,
    });
    expect(response.orderNo).toBe(existing.outTradeNo);
  });

  it('rejects a globally unique request id owned by another user', async () => {
    const existing = {
      clientRequestId: '12345678-1234-1234-1234-123456789012',
      outTradeNo: 'MA12345678',
      status: TipOrderStatus.PENDING,
      totalAmount: 500,
      userId: 8,
    } as TipOrderEntity;
    const tipOrders = {
      findOneBy: jest.fn().mockResolvedValue(existing),
    };
    const users = {
      findOneBy: jest.fn().mockResolvedValue({ id: 7, openId: 'openid-7' }),
    };
    const thirdParty = {
      getWechatSession: jest.fn().mockResolvedValue({
        openId: 'openid-7',
        sessionKey: 'session-key',
      }),
    };
    const virtualPayment = {
      assertEnabled: jest.fn(),
      createPaymentParameters: jest.fn(),
      getMaximumTipAmountYuan: jest.fn().mockReturnValue(200),
    };
    const service = new TipService(
      tipOrders as never,
      users as never,
      {} as never,
      thirdParty as never,
      virtualPayment as never,
    );

    await expect(
      service.createOrder(7, {
        amountYuan: 5,
        clientRequestId: existing.clientRequestId,
        loginCode: 'one-time-code',
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'TIP_REQUEST_DUPLICATE',
        message: '赞赏请求号已被使用，请重新操作',
      },
    });
    expect(virtualPayment.createPaymentParameters).not.toHaveBeenCalled();
  });
});

describe('TipService payment notifications', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('uses query_order, rather than webhook fields, as the trusted state', async () => {
    const order = {
      id: 1,
      environment: 0,
      outTradeNo: 'MA12345678',
      payerOpenId: 'openid-1',
      productId: 'zanshang',
      quantity: 5,
      status: TipOrderStatus.PENDING,
      totalAmount: 500,
      wxOrderId: null,
    } as TipOrderEntity;
    const orderRepository = {
      findOne: jest.fn().mockResolvedValue(order),
      save: jest.fn((value: TipOrderEntity) => Promise.resolve(value)),
    };
    const tipOrders = {
      findOne: jest.fn().mockResolvedValue(order),
      findOneBy: jest.fn().mockResolvedValue(order),
    };
    const dataSource = {
      transaction: jest.fn(
        async (
          callback: (manager: {
            getRepository: () => typeof orderRepository;
          }) => Promise<TipOrderEntity>,
        ) => callback({ getRepository: () => orderRepository }),
      ),
    };
    const virtualPayment = {
      queryOrder: jest
        .fn()
        .mockResolvedValueOnce({
          orderFee: 500,
          orderId: order.outTradeNo,
          paidFee: 500,
          paidTime: 1700000000,
          refundFee: 0,
          status: 2,
          wxOrderId: 'wx-order-1',
        })
        .mockResolvedValueOnce({
          orderFee: 500,
          orderId: order.outTradeNo,
          paidFee: 500,
          paidTime: 1700000000,
          refundFee: 0,
          status: 2,
          wxOrderId: 'wx-order-1',
        })
        .mockResolvedValueOnce({
          orderFee: 500,
          orderId: order.outTradeNo,
          paidFee: 500,
          paidTime: 1700000100,
          refundFee: 500,
          status: 5,
          wxOrderId: 'wx-order-1',
        })
        .mockResolvedValueOnce({
          orderFee: 500,
          orderId: order.outTradeNo,
          paidFee: 500,
          paidTime: 1700000100,
          refundFee: 500,
          status: 5,
          wxOrderId: 'wx-order-1',
        }),
    };
    const service = new TipService(
      tipOrders as never,
      {} as never,
      dataSource as never,
      {} as never,
      virtualPayment as never,
    );
    const paymentPayload = {
      GoodsInfo: { ActualPrice: '1', ProductId: 'untrusted-product' },
      OpenId: 'untrusted-openid',
      OutTradeNo: order.outTradeNo,
    };

    await service.handleGoodsDeliver(paymentPayload);
    await service.handleGoodsDeliver(paymentPayload);

    expect(order).toEqual(
      expect.objectContaining({
        paidAt: new Date(1700000000 * 1000),
        status: TipOrderStatus.PAID,
        wxOrderId: 'wx-order-1',
      }),
    );
    expect(virtualPayment.queryOrder).toHaveBeenCalledWith(order);
    expect(orderRepository.save).toHaveBeenCalledTimes(1);

    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-03T08:00:00.000Z'));
    await service.handleRefund({
      MchOrderId: order.outTradeNo,
      RefundFee: '1',
    });
    jest.setSystemTime(new Date('2026-09-03T09:00:00.000Z'));
    await service.handleRefund({
      MchOrderId: order.outTradeNo,
    });

    expect(order).toEqual(
      expect.objectContaining({
        refundedAt: new Date('2026-09-03T08:00:00.000Z'),
        status: TipOrderStatus.REFUNDED,
      }),
    );
    expect(orderRepository.save).toHaveBeenCalledTimes(2);
  });
});
