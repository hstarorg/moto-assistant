import { WechatVirtualPaymentErrorCode } from './error-codes';

export class WechatVirtualPaymentError extends Error {
  readonly code: WechatVirtualPaymentErrorCode;

  constructor(
    code: WechatVirtualPaymentErrorCode,
    readonly upstreamCode?: number,
  ) {
    super();
    this.name = WechatVirtualPaymentError.name;
    this.code = code;
  }
}
