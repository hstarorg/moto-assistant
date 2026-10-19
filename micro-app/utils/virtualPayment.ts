import type { TipPaymentParameters } from '../types';

export type VirtualPaymentFailureReason =
  'cancelled' | 'failed' | 'not-supported';

interface VirtualPaymentFailResult {
  errCode?: number;
  errMsg?: string;
}

interface VirtualPaymentRequestOptions extends TipPaymentParameters {
  fail(result: VirtualPaymentFailResult): void;
  success(): void;
}

interface WxWithVirtualPayment {
  requestVirtualPayment?: (options: VirtualPaymentRequestOptions) => void;
}

const virtualPaymentWx = wx as unknown as WxWithVirtualPayment;

export class VirtualPaymentError extends Error {
  constructor(
    readonly reason: VirtualPaymentFailureReason,
    readonly errCode?: number
  ) {
    super();
    this.name = 'VirtualPaymentError';
  }
}

export const isVirtualPaymentSupported = (): boolean => {
  return (
    typeof virtualPaymentWx.requestVirtualPayment === 'function' &&
    wx.canIUse('requestVirtualPayment')
  );
};

export const requestVirtualPayment = (
  payment: TipPaymentParameters
): Promise<void> => {
  const request = virtualPaymentWx.requestVirtualPayment;
  if (!isVirtualPaymentSupported() || !request) {
    return Promise.reject(new VirtualPaymentError('not-supported'));
  }

  return new Promise((resolve, reject) => {
    request({
      mode: payment.mode,
      paySig: payment.paySig,
      signData: payment.signData,
      signature: payment.signature,
      success() {
        resolve();
      },
      fail(result) {
        const cancelled =
          result.errCode === -2 || /cancel/i.test(result.errMsg ?? '');
        reject(
          new VirtualPaymentError(
            cancelled ? 'cancelled' : 'failed',
            result.errCode
          )
        );
      }
    });
  });
};

export const shouldRetryPaymentSession = (error: unknown): boolean => {
  return (
    error instanceof VirtualPaymentError &&
    (error.errCode === -15005 || error.errCode === -15007)
  );
};
