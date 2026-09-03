import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TipOrderEntity } from '../database';
import {
  WechatVirtualPayment,
  type WechatVirtualPaymentConfig,
  WechatVirtualPaymentError,
  type WechatVirtualPaymentOrder,
} from '../lib/wechat-virtual-payment';
import type { TipPaymentParameters } from './service.types';
import { ThirdPartyService } from './third-party.service';

export const TIP_PRODUCT_ID = 'zanshang';
export const TIP_UNIT_PRICE_CENTS = 100;

@Injectable()
export class WechatVirtualPaymentService {
  private readonly client?: WechatVirtualPayment;
  private readonly environment: 0 | 1;

  constructor(
    config: ConfigService,
    private readonly thirdParty: ThirdPartyService,
  ) {
    const paymentConfig = this.parseConfig(config);
    this.environment = paymentConfig?.environment ?? 1;
    if (paymentConfig) {
      this.client = new WechatVirtualPayment(paymentConfig, {
        getAccessToken: () => this.thirdParty.getWechatAccessToken(),
      });
    }
  }

  assertEnabled(): void {
    if (!this.client) {
      throw new ServiceUnavailableException({
        code: 'VIRTUAL_PAYMENT_UNAVAILABLE',
        message: '赞赏功能暂不可用',
      });
    }
  }

  createPaymentParameters(
    order: TipOrderEntity,
    sessionKey: string,
  ): TipPaymentParameters {
    return this.getClient().createPaymentParameters({
      outTradeNo: order.outTradeNo,
      productId: order.productId,
      quantity: order.quantity,
      sessionKey,
      unitPrice: order.unitPrice,
    });
  }

  getEnvironment(): 0 | 1 {
    return this.environment;
  }

  getMaximumTipAmountYuan(): number {
    return 200;
  }

  getMaximumPendingOrderCount(): number {
    return 5;
  }

  async queryOrder(order: TipOrderEntity): Promise<WechatVirtualPaymentOrder> {
    try {
      return await this.getClient().queryOrder({
        openId: order.payerOpenId,
        orderId: order.outTradeNo,
        totalAmount: order.totalAmount,
      });
    } catch {
      throw new ServiceUnavailableException('微信订单查询暂时不可用');
    }
  }

  decryptMessage(
    encrypted: string,
    signature: string | undefined,
    timestamp: string | undefined,
    nonce: string | undefined,
  ): string {
    try {
      return this.getClient().decryptMessage(
        encrypted,
        signature,
        timestamp,
        nonce,
      );
    } catch (error) {
      if (error instanceof WechatVirtualPaymentError) {
        throw new ForbiddenException('微信消息认证失败');
      }
      throw error;
    }
  }

  private getClient(): WechatVirtualPayment {
    this.assertEnabled();
    return this.client as WechatVirtualPayment;
  }

  private parseConfig(
    config: ConfigService,
  ): WechatVirtualPaymentConfig | undefined {
    const configValue = config.get<string>('WECHAT_VPAY_CONFIG')?.trim();
    if (!configValue) {
      return undefined;
    }

    const parts = configValue.split('|');
    if (parts.length !== 5 || parts.some((part) => part.trim().length === 0)) {
      throw new Error(
        'WECHAT_VPAY_CONFIG 格式不正确，应为 offerId|appKey|environment|messageToken|encodingAesKey',
      );
    }
    const [offerId, appKey, environmentValue, messageToken, encodingAesKey] =
      parts.map((part) => part.trim());
    if (environmentValue !== 'sandbox' && environmentValue !== 'production') {
      throw new Error(
        'WECHAT_VPAY_CONFIG 中 environment 必须是 sandbox 或 production',
      );
    }
    if (
      config.get<string>('NODE_ENV') === 'production' &&
      environmentValue !== 'production'
    ) {
      throw new Error('生产环境不能启用微信虚拟支付沙箱配置');
    }

    const appId = config.get<string>('WECHAT_CONFIG')?.split('|')[0]?.trim();
    if (!appId) {
      throw new Error('WECHAT_CONFIG 中缺少 AppID');
    }

    return {
      appId,
      appKey,
      encodingAesKey,
      environment: environmentValue === 'production' ? 0 : 1,
      messageToken,
      offerId,
    };
  }
}
