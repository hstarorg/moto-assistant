import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { WechatMessageQueryDto } from '../dto/wechat-message.dto';
import { TipService } from './tip.service';
import { WechatVirtualPaymentService } from './wechat-virtual-payment.service';

type WechatMessagePayload = Record<string, unknown>;

@Injectable()
export class WechatMessageService {
  private readonly logger = new Logger(WechatMessageService.name);

  constructor(
    private readonly tipService: TipService,
    private readonly virtualPayment: WechatVirtualPaymentService,
  ) {}

  verifyUrl(query: WechatMessageQueryDto): string {
    this.virtualPayment.assertEnabled();
    if (!query.echostr) {
      throw new BadRequestException('微信验证参数不正确');
    }

    return this.virtualPayment.decryptMessage(
      query.echostr,
      query.msg_signature,
      query.timestamp,
      query.nonce,
    );
  }

  async handlePush(
    query: WechatMessageQueryDto,
    body: unknown,
  ): Promise<{ ErrCode: 0; ErrMsg: 'success' }> {
    this.virtualPayment.assertEnabled();
    if (!this.isPayload(body)) {
      throw new BadRequestException('微信消息格式不正确');
    }

    const encrypted = this.readOptionalString(body, ['Encrypt']);
    if (!encrypted) {
      throw new BadRequestException('微信消息必须使用安全模式');
    }
    const decrypted = this.virtualPayment.decryptMessage(
      encrypted,
      query.msg_signature,
      query.timestamp,
      query.nonce,
    );
    const payload = this.parseJson(decrypted);

    const event = this.readOptionalString(payload, ['Event', 'event']);
    if (event === 'xpay_goods_deliver_notify') {
      await this.tipService.handleGoodsDeliver(payload);
    } else if (event === 'xpay_refund_notify') {
      await this.tipService.handleRefund(payload);
    } else {
      this.logger.warn(`已忽略微信消息事件: ${event ?? 'unknown'}`);
    }

    return { ErrCode: 0, ErrMsg: 'success' };
  }

  private parseJson(value: string): WechatMessagePayload {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      throw new BadRequestException('微信消息格式不正确');
    }

    if (!this.isPayload(parsed)) {
      throw new BadRequestException('微信消息格式不正确');
    }
    return parsed;
  }

  private isPayload(value: unknown): value is WechatMessagePayload {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private readOptionalString(
    payload: WechatMessagePayload,
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
