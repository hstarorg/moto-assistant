import { BadRequestException } from '@nestjs/common';
import type { TipService } from './tip.service';
import { WechatMessageService } from './wechat-message.service';
import type { WechatVirtualPaymentService } from './wechat-virtual-payment.service';

describe('WechatMessageService', () => {
  const tipService = {
    handleGoodsDeliver:
      jest.fn<(payload: Record<string, unknown>) => Promise<void>>(),
    handleRefund:
      jest.fn<(payload: Record<string, unknown>) => Promise<void>>(),
  };
  const virtualPayment = {
    assertEnabled: jest.fn(),
    decryptMessage: jest.fn(),
  };
  let service: WechatMessageService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WechatMessageService(
      tipService as unknown as TipService,
      virtualPayment as unknown as WechatVirtualPaymentService,
    );
  });

  it('decrypts JSON and uses the delivery webhook only as a refresh hint', async () => {
    virtualPayment.decryptMessage.mockReturnValue(
      JSON.stringify({
        Event: 'xpay_goods_deliver_notify',
        GoodsInfo: { ActualPrice: 1 },
        OpenId: 'untrusted-openid',
        OutTradeNo: 'MA12345678',
      }),
    );

    await expect(
      service.handlePush(
        {
          encrypt_type: 'aes',
          msg_signature: 'message-signature',
          nonce: 'nonce',
          timestamp: '1700000000',
        },
        { Encrypt: 'encrypted-value' },
      ),
    ).resolves.toEqual({ ErrCode: 0, ErrMsg: 'success' });
    expect(virtualPayment.decryptMessage).toHaveBeenCalledWith(
      'encrypted-value',
      'message-signature',
      '1700000000',
      'nonce',
    );
    expect(tipService.handleGoodsDeliver).toHaveBeenCalledWith({
      Event: 'xpay_goods_deliver_notify',
      GoodsInfo: { ActualPrice: 1 },
      OpenId: 'untrusted-openid',
      OutTradeNo: 'MA12345678',
    });
  });

  it('dispatches an encrypted refund reminder', async () => {
    virtualPayment.decryptMessage.mockReturnValue(
      JSON.stringify({
        Event: 'xpay_refund_notify',
        MchOrderId: 'MA12345678',
      }),
    );

    await service.handlePush(
      {
        encrypt_type: 'aes',
        msg_signature: 'message-signature',
        nonce: 'nonce',
        timestamp: '1700000000',
      },
      { Encrypt: 'encrypted-value' },
    );

    expect(tipService.handleRefund).toHaveBeenCalledWith({
      Event: 'xpay_refund_notify',
      MchOrderId: 'MA12345678',
    });
  });

  it('rejects a callback that is not encrypted', async () => {
    await expect(
      service.handlePush(
        { nonce: 'nonce', signature: 'signature', timestamp: '1700000000' },
        { Event: 'xpay_goods_deliver_notify' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects decrypted content that is not a JSON object', async () => {
    virtualPayment.decryptMessage.mockReturnValue('[]');

    await expect(
      service.handlePush(
        {
          encrypt_type: 'aes',
          msg_signature: 'message-signature',
          nonce: 'nonce',
          timestamp: '1700000000',
        },
        { Encrypt: 'encrypted-value' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
