import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { TipService } from './tip.service';
import { WechatVirtualPaymentService } from './wechat-virtual-payment.service';

@Injectable()
export class TipReconciliationService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(TipReconciliationService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private afterId = 0;

  constructor(
    private readonly tips: TipService,
    private readonly virtualPayment: WechatVirtualPaymentService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.virtualPayment.isEnabled()) {
      return;
    }
    this.timer = setInterval(() => void this.run(), 5 * 60 * 1000);
    this.timer.unref();
    void this.run();
  }

  async onApplicationShutdown(): Promise<void> {
    clearInterval(this.timer);
    await this.running;
  }

  run(): Promise<void> {
    this.running ??= this.tips
      .reconcileOrders(this.afterId)
      .then((afterId) => {
        this.afterId = afterId;
      })
      .catch(() => {
        this.logger.warn('赞赏订单补偿任务暂未完成');
      })
      .finally(() => {
        this.running = undefined;
      });
    return this.running;
  }
}
