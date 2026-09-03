import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import {
  DataSource,
  MoreThanOrEqual,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { TipOrderStatus } from '../constants';
import { TipOrderEntity, UserEntity } from '../database';
import { CreateTipOrderDto } from '../dto/tip.dto';
import type { WechatVirtualPaymentOrder } from '../lib/wechat-virtual-payment';
import type { CreateTipOrderResponse, TipOrderResponse } from './service.types';
import { ThirdPartyService } from './third-party.service';
import {
  TIP_PRODUCT_ID,
  TIP_UNIT_PRICE_CENTS,
  WechatVirtualPaymentService,
} from './wechat-virtual-payment.service';

type MessagePayload = Record<string, unknown>;

@Injectable()
export class TipService {
  constructor(
    @InjectRepository(TipOrderEntity)
    private readonly tipOrders: Repository<TipOrderEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly dataSource: DataSource,
    private readonly thirdParty: ThirdPartyService,
    private readonly virtualPayment: WechatVirtualPaymentService,
  ) {}

  async createOrder(
    userId: number,
    dto: CreateTipOrderDto,
  ): Promise<CreateTipOrderResponse> {
    this.virtualPayment.assertEnabled();
    this.assertAmount(dto.amountYuan);

    const [user, wechatSession] = await Promise.all([
      this.users.findOneBy({ id: userId }),
      this.thirdParty.getWechatSession(dto.loginCode),
    ]);
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    if (user.openId !== wechatSession.openId) {
      throw new ConflictException({
        code: 'WECHAT_ACCOUNT_MISMATCH',
        message: '微信账号状态已变化，请重新进入小程序',
      });
    }

    const existing = await this.tipOrders.findOneBy({
      clientRequestId: dto.clientRequestId,
      userId,
    });
    if (existing) {
      return this.recreatePayment(existing, dto, wechatSession.sessionKey);
    }

    const recentPendingCount = await this.tipOrders.countBy({
      createdAt: MoreThanOrEqual(new Date(Date.now() - 10 * 60 * 1000)),
      status: TipOrderStatus.PENDING,
      userId,
    });
    if (
      recentPendingCount >= this.virtualPayment.getMaximumPendingOrderCount()
    ) {
      throw new HttpException(
        {
          code: 'TIP_ORDER_RATE_LIMITED',
          message: '操作太频繁，请稍后再试',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const order = this.tipOrders.create({
      clientRequestId: dto.clientRequestId,
      environment: this.virtualPayment.getEnvironment(),
      outTradeNo: this.createOutTradeNo(),
      payerOpenId: user.openId,
      productId: TIP_PRODUCT_ID,
      quantity: dto.amountYuan,
      status: TipOrderStatus.PENDING,
      totalAmount: dto.amountYuan * TIP_UNIT_PRICE_CENTS,
      unitPrice: TIP_UNIT_PRICE_CENTS,
      userId,
    });

    try {
      const saved = await this.tipOrders.save(order);
      return this.toCreateResponse(saved, wechatSession.sessionKey);
    } catch (error) {
      if (!this.isUniqueViolation(error)) {
        throw error;
      }
      const concurrent = await this.tipOrders.findOneBy({
        clientRequestId: dto.clientRequestId,
        userId,
      });
      if (!concurrent) {
        throw error;
      }
      return this.recreatePayment(concurrent, dto, wechatSession.sessionKey);
    }
  }

  async findOrder(userId: number, orderNo: string): Promise<TipOrderResponse> {
    if (!/^[A-Za-z0-9|*@-]{8,32}$/u.test(orderNo)) {
      throw new NotFoundException('赞赏订单不存在');
    }
    const order = await this.tipOrders.findOneBy({
      outTradeNo: orderNo,
      userId,
    });
    if (!order) {
      throw new NotFoundException('赞赏订单不存在');
    }
    return this.toResponse(await this.synchronizeOrder(order));
  }

  async handleGoodsDeliver(payload: MessagePayload): Promise<void> {
    const outTradeNo = this.readString(payload, ['OutTradeNo', 'out_trade_no']);
    const order = await this.tipOrders.findOneBy({ outTradeNo });
    if (!order) {
      throw new NotFoundException('赞赏订单不存在');
    }

    const synchronized = await this.synchronizeOrder(order);
    if (synchronized.status === TipOrderStatus.PENDING) {
      throw new ServiceUnavailableException('微信订单状态待确认');
    }
  }

  async handleRefund(payload: MessagePayload): Promise<void> {
    const merchantOrderId = this.readOptionalString(payload, [
      'MchOrderId',
      'mch_order_id',
      'OutTradeNo',
      'out_trade_no',
    ]);
    const wechatOrderId = this.readOptionalString(payload, [
      'WxOrderId',
      'wx_order_id',
    ]);
    if (!merchantOrderId && !wechatOrderId) {
      throw new BadRequestException('微信退款消息格式不正确');
    }

    const identifiers = [merchantOrderId, wechatOrderId].filter(
      (value): value is string => value !== undefined,
    );
    const order = await this.tipOrders.findOne({
      where: identifiers.flatMap((identifier) => [
        { outTradeNo: identifier },
        { wxOrderId: identifier },
      ]),
    });
    if (!order) {
      throw new NotFoundException('赞赏订单不存在');
    }

    const synchronized = await this.synchronizeOrder(order);
    if (synchronized.status !== TipOrderStatus.REFUNDED) {
      throw new ServiceUnavailableException('微信退款状态待确认');
    }
  }

  private async synchronizeOrder(
    order: TipOrderEntity,
  ): Promise<TipOrderEntity> {
    const remoteOrder = await this.virtualPayment.queryOrder(order);
    const nextStatus = this.mapRemoteStatus(remoteOrder);

    return this.dataSource.transaction(async (manager) => {
      const orders = manager.getRepository(TipOrderEntity);
      const locked = await orders.findOne({
        lock: { mode: 'pessimistic_write' },
        where: { id: order.id },
      });
      if (!locked) {
        throw new NotFoundException('赞赏订单不存在');
      }
      if (!this.canTransition(locked.status, nextStatus)) {
        return locked;
      }

      let changed = false;
      if (locked.status !== nextStatus) {
        locked.status = nextStatus;
        changed = true;
      }
      if (remoteOrder.wxOrderId && locked.wxOrderId !== remoteOrder.wxOrderId) {
        locked.wxOrderId = remoteOrder.wxOrderId;
        changed = true;
      }
      if (
        nextStatus === TipOrderStatus.PAID &&
        remoteOrder.paidTime > 0 &&
        !locked.paidAt
      ) {
        locked.paidAt = new Date(remoteOrder.paidTime * 1000);
        changed = true;
      }
      if (
        nextStatus === TipOrderStatus.REFUNDED &&
        remoteOrder.paidTime > 0 &&
        !locked.refundedAt
      ) {
        locked.refundedAt = new Date(remoteOrder.paidTime * 1000);
        changed = true;
      }
      return changed ? orders.save(locked) : locked;
    });
  }

  private mapRemoteStatus(order: WechatVirtualPaymentOrder): TipOrderStatus {
    if (order.status === 0 || order.status === 1) {
      return TipOrderStatus.PENDING;
    }
    if ([2, 3, 4, 7, 9, 10].includes(order.status)) {
      if (order.paidFee !== order.orderFee || order.paidTime <= 0) {
        throw new BadRequestException('微信订单支付信息不正确');
      }
      return TipOrderStatus.PAID;
    }
    if (order.status === 5 || order.status === 8) {
      if (
        order.paidFee !== order.orderFee ||
        order.refundFee !== order.orderFee ||
        order.paidTime <= 0
      ) {
        throw new BadRequestException('微信订单退款信息不正确');
      }
      return TipOrderStatus.REFUNDED;
    }
    if (order.status === 6) {
      return TipOrderStatus.CLOSED;
    }
    throw new BadRequestException('微信订单状态不正确');
  }

  private canTransition(
    current: TipOrderStatus,
    next: TipOrderStatus,
  ): boolean {
    if (current === next) {
      return true;
    }
    if (
      current === TipOrderStatus.REFUNDED ||
      current === TipOrderStatus.CLOSED
    ) {
      return false;
    }
    if (current === TipOrderStatus.PAID) {
      return next === TipOrderStatus.REFUNDED;
    }
    return true;
  }

  private assertAmount(amountYuan: number): void {
    if (
      !Number.isSafeInteger(amountYuan) ||
      amountYuan < 1 ||
      amountYuan > this.virtualPayment.getMaximumTipAmountYuan()
    ) {
      throw new BadRequestException({
        code: 'TIP_AMOUNT_INVALID',
        message: '请输入正确的赞赏金额',
      });
    }
  }

  private recreatePayment(
    order: TipOrderEntity,
    dto: CreateTipOrderDto,
    sessionKey: string,
  ): CreateTipOrderResponse {
    if (order.totalAmount !== dto.amountYuan * TIP_UNIT_PRICE_CENTS) {
      throw new ConflictException({
        code: 'TIP_REQUEST_DUPLICATE',
        message: '赞赏请求已发生变化，请重新操作',
      });
    }
    if (order.status !== TipOrderStatus.PENDING) {
      throw new ConflictException({
        code: 'TIP_ORDER_ALREADY_PROCESSED',
        message: '该赞赏订单已处理，请重新选择金额',
      });
    }
    return this.toCreateResponse(order, sessionKey);
  }

  private toCreateResponse(
    order: TipOrderEntity,
    sessionKey: string,
  ): CreateTipOrderResponse {
    return {
      amountYuan: order.totalAmount / TIP_UNIT_PRICE_CENTS,
      orderNo: order.outTradeNo,
      payment: this.virtualPayment.createPaymentParameters(order, sessionKey),
    };
  }

  private toResponse(order: TipOrderEntity): TipOrderResponse {
    return {
      amountYuan: order.totalAmount / TIP_UNIT_PRICE_CENTS,
      createdAt: order.createdAt.toISOString(),
      orderNo: order.outTradeNo,
      paidAt: order.paidAt?.toISOString() ?? null,
      status: order.status,
    };
  }

  private createOutTradeNo(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = randomBytes(8).toString('hex').toUpperCase();
    return `MA${timestamp}${random}`;
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }
    return (
      (error.driverError as { code?: unknown } | undefined)?.code === '23505'
    );
  }

  private readString(payload: MessagePayload, keys: string[]): string {
    const value = this.readOptionalString(payload, keys);
    if (value !== undefined) {
      return value;
    }
    throw new BadRequestException('微信支付消息格式不正确');
  }

  private readOptionalString(
    payload: MessagePayload,
    keys: string[],
  ): string | undefined {
    for (const key of keys) {
      const value = payload[key];
      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
    }
    return undefined;
  }
}
