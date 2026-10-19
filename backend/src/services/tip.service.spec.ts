import { TipOrderStatus } from '../constants';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import type { TipOrderEntity } from '../database';
import { TipService } from './tip.service';

// Isolated application-policy tests with normalized SDK values, NOT provider
// response fixtures. HTTP/database guarantees live in payment.e2e-spec.ts.
describe('TipService order creation policy', () => {
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
      queryRefundOrder: jest.fn().mockResolvedValue({
        orderType: 1,
        refundFee: 500,
        status: 8,
      }),
      queryOrder: jest
        .fn()
        .mockResolvedValueOnce({
          orderFee: 500,
          orderType: 0,
          leftFee: 500,
          orderId: order.outTradeNo,
          paidFee: 500,
          paidTime: 1700000000,
          refundFee: 0,
          status: 2,
          wxOrderId: 'wx-order-1',
        })
        .mockResolvedValueOnce({
          orderFee: 500,
          orderType: 0,
          leftFee: 500,
          orderId: order.outTradeNo,
          paidFee: 500,
          paidTime: 1700000000,
          refundFee: 0,
          status: 2,
          wxOrderId: 'wx-order-1',
        })
        .mockResolvedValueOnce({
          orderFee: 500,
          orderType: 0,
          leftFee: 0,
          orderId: order.outTradeNo,
          paidFee: 500,
          paidTime: 1700000000,
          refundFee: 0,
          status: 4,
          wxOrderId: 'wx-order-1',
        })
        .mockResolvedValueOnce({
          orderFee: 500,
          orderType: 0,
          leftFee: 0,
          orderId: order.outTradeNo,
          paidFee: 500,
          paidTime: 1700000000,
          refundFee: 0,
          status: 4,
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
      MchRefundId: 'REFUND12345678',
      RefundFee: '1',
    });
    jest.setSystemTime(new Date('2026-09-03T09:00:00.000Z'));
    await service.handleRefund({
      MchOrderId: order.outTradeNo,
      MchRefundId: 'REFUND12345678',
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

describe('TipService synchronization and compensation', () => {
  function fixture() {
    const order = {
      id: 1,
      userId: 7,
      environment: 0,
      outTradeNo: 'MA12345678',
      totalAmount: 500,
      status: TipOrderStatus.PENDING,
      createdAt: new Date(),
    } as TipOrderEntity;
    const remote = {
      leftFee: 500,
      orderFee: 500,
      orderId: order.outTradeNo,
      orderType: 0,
      paidFee: 500,
      paidTime: 1700000000,
      refundFee: 0,
      status: 2,
      wxOrderId: 'wx-order-1',
    };
    const refund = {
      orderType: 1,
      refundFee: 500,
      status: 5,
    };
    const repository = {
      findOne: jest.fn().mockResolvedValue(order),
      save: jest.fn((value: TipOrderEntity) => Promise.resolve(value)),
    };
    const tipOrders = {
      find: jest.fn().mockResolvedValue([order]),
      findOne: jest.fn().mockResolvedValue(order),
      findOneBy: jest.fn().mockResolvedValue(order),
    };
    const dataSource = {
      transaction: jest.fn(
        async (
          callback: (manager: {
            getRepository: () => typeof repository;
          }) => Promise<TipOrderEntity>,
        ) => callback({ getRepository: () => repository }),
      ),
    };
    const payment = {
      getEnvironment: jest.fn().mockReturnValue(0),
      notifyProvideGoods: jest.fn().mockResolvedValue(undefined),
      queryOrder: jest.fn().mockImplementation(() => Promise.resolve(remote)),
      queryRefundOrder: jest
        .fn()
        .mockImplementation(() => Promise.resolve(refund)),
    };
    const service = new TipService(
      tipOrders as never,
      {} as never,
      dataSource as never,
      {} as never,
      payment as never,
    );
    return {
      service,
      order,
      remote,
      refund,
      repository,
      tipOrders,
      dataSource,
      payment,
    };
  }

  it('keeps a merchant-debited refund non-terminal and accepts a later failure', async () => {
    const f = fixture();
    f.remote.status = 5;
    f.remote.leftFee = 0;
    const payload = {
      MchOrderId: f.order.outTradeNo,
      MchRefundId: 'REFUND12345678',
      RetCode: 0,
      RefundFee: 500,
    };
    await expect(f.service.handleRefund(payload)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(f.order.status).toBe(TipOrderStatus.PAID);
    expect(f.order.refundedAt).toBeUndefined();
    f.remote.status = 7;
    f.remote.leftFee = 500;
    f.refund.status = 7;
    await f.service.handleRefund(payload);
    expect(f.order.status).toBe(TipOrderStatus.PAID);
    expect(f.order.refundedAt).toBeUndefined();
  });

  it('returns a stable not-found code without querying another user payment', async () => {
    const f = fixture();
    f.tipOrders.findOneBy.mockResolvedValue(null);
    await expect(
      f.service.findOrder(99, f.order.outTradeNo),
    ).rejects.toMatchObject({
      response: { code: 'TIP_ORDER_NOT_FOUND' },
    });
    expect(f.tipOrders.findOneBy).toHaveBeenCalledWith({
      outTradeNo: f.order.outTradeNo,
      userId: 99,
    });
    expect(f.payment.queryOrder).not.toHaveBeenCalled();
  });

  it('requires the original payment balance to corroborate a full refund', async () => {
    const f = fixture();
    f.remote.status = 4;
    f.refund.status = 8;
    await expect(
      f.service.handleRefund({
        MchOrderId: f.order.outTradeNo,
        WxRefundId: 'wx-refund-1',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(f.repository.save).not.toHaveBeenCalled();
    f.remote.leftFee = 0;
    await f.service.handleRefund({
      MchOrderId: f.order.outTradeNo,
      WxRefundId: 'wx-refund-1',
    });
    expect(f.order.status).toBe(TipOrderStatus.REFUNDED);
    expect(f.order.paidAt).toEqual(new Date(1700000000 * 1000));
    expect(f.order.wxOrderId).toBe('wx-order-1');
  });

  it('does not mistake a partial refund for a fully refunded payment', async () => {
    const f = fixture();
    f.remote.status = 4;
    f.remote.leftFee = 400;
    f.refund.status = 8;
    f.refund.refundFee = 100;
    await f.service.handleRefund({
      MchOrderId: f.order.outTradeNo,
      MchRefundId: 'REFUND12345678',
    });
    expect(f.order.status).toBe(TipOrderStatus.PAID);
    expect(f.order.refundedAt).toBeUndefined();
  });

  it('requests delivery for paid but not already-delivered remote states', async () => {
    const f = fixture();
    f.payment.notifyProvideGoods.mockImplementation(() => {
      expect(f.order.status).toBe(TipOrderStatus.PAID);
      return Promise.resolve();
    });
    await f.service.findOrder(7, f.order.outTradeNo);
    expect(f.payment.notifyProvideGoods).toHaveBeenCalledWith(f.order);
    f.remote.status = 4;
    await f.service.findOrder(7, f.order.outTradeNo);
    expect(f.payment.notifyProvideGoods).toHaveBeenCalledTimes(1);
  });

  it('does not request delivery when the database boundary rejects the transaction', async () => {
    const f = fixture();
    f.dataSource.transaction.mockRejectedValue(new Error('commit failed'));
    await expect(f.service.findOrder(7, f.order.outTradeNo)).rejects.toThrow(
      'commit failed',
    );
    expect(f.payment.notifyProvideGoods).not.toHaveBeenCalled();
  });

  it('retries delivery of a locally paid order on the next compensation pass', async () => {
    const f = fixture();
    f.payment.notifyProvideGoods.mockRejectedValueOnce(
      new Error('network failure'),
    );
    await expect(f.service.findOrder(7, f.order.outTradeNo)).rejects.toThrow();
    expect(f.order.status).toBe(TipOrderStatus.PAID);
    expect(await f.service.reconcileOrders(0)).toBe(0);
    expect(f.payment.notifyProvideGoods).toHaveBeenCalledTimes(2);
    expect(f.tipOrders.find).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
    const [options] = f.tipOrders.find.mock.calls[0] as [
      { where: { environment: number } },
    ];
    expect(options.where.environment).toBe(0);
  });

  it('advances the compensation cursor despite failures so old orders cannot starve new ones', async () => {
    const f = fixture();
    f.tipOrders.find.mockResolvedValue(
      Array.from({ length: 50 }, (_, index) => ({
        ...f.order,
        id: index + 1,
      })),
    );
    const warning = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    try {
      f.payment.queryOrder.mockRejectedValue(new Error('unavailable'));
      expect(await f.service.reconcileOrders(0)).toBe(50);
      expect(f.payment.queryOrder).toHaveBeenCalledTimes(50);
    } finally {
      warning.mockRestore();
    }
  });
});
