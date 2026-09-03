import ajax = require('../../utils/ajax');
import messageBox = require('../../utils/messageBox');
import {
  isVirtualPaymentSupported,
  requestVirtualPayment,
  shouldRetryPaymentSession,
  VirtualPaymentError
} from '../../utils/virtualPayment';
import type {
  CreateTipOrderResponse,
  MotoAppOptions,
  TipOrderResponse,
  TipOrderStatus
} from '../../types';

type PaymentState = 'idle' | 'pending' | 'success';

const app = getApp<MotoAppOptions>();
const QUICK_AMOUNTS = [1, 5, 10] as const;
const MAXIMUM_AMOUNT_YUAN = 200;
const ORDER_POLL_DELAYS = [0, 800, 1200, 1800, 2400] as const;
const PENDING_ORDER_MAXIMUM_AGE = 24 * 60 * 60 * 1000;
const PENDING_ORDER_STORAGE_KEY = 'pendingTipOrder';
let paymentFlowVersion = 0;

interface StoredPendingOrder {
  orderNo: string;
  savedAt: number;
}

const wait = (milliseconds: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
};

const getLoginCode = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    wx.login({
      success({ code }) {
        if (code) {
          resolve(code);
          return;
        }
        reject(new Error('微信登录未返回有效凭证'));
      },
      fail() {
        reject(new Error('微信登录失败'));
      }
    });
  });
};

const confirmAmount = (amountYuan: number): Promise<boolean> => {
  return new Promise(resolve => {
    wx.showModal({
      title: `确认赞赏 ¥${amountYuan}`,
      content: '赞赏为自愿支持，不会解锁额外功能，也不影响正常使用。',
      confirmText: '确认赞赏',
      confirmColor: '#16794a',
      success(result) {
        resolve(result.confirm);
      },
      fail() {
        resolve(false);
      }
    });
  });
};

const createClientRequestId = (): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 14);
  return `tip-${timestamp}-${random}`;
};

const savePendingOrder = (orderNo: string): void => {
  try {
    wx.setStorageSync(PENDING_ORDER_STORAGE_KEY, {
      orderNo,
      savedAt: Date.now()
    } as StoredPendingOrder);
  } catch {
    // 本地存储失败不影响已经发起的支付，当前页面仍会继续查单。
  }
};

const clearPendingOrder = (): void => {
  try {
    wx.removeStorageSync(PENDING_ORDER_STORAGE_KEY);
  } catch {
    // 清理失败时保留旧记录，下次进入页面会再次主动查单。
  }
};

const getPendingOrder = (): StoredPendingOrder | undefined => {
  let stored: unknown;
  try {
    stored = wx.getStorageSync(PENDING_ORDER_STORAGE_KEY) as unknown;
  } catch {
    return undefined;
  }
  if (typeof stored !== 'object' || stored === null) {
    return undefined;
  }
  const { orderNo, savedAt } = stored as Partial<StoredPendingOrder>;
  if (
    typeof orderNo !== 'string' ||
    !/^[A-Za-z0-9|*@-]{8,32}$/u.test(orderNo) ||
    typeof savedAt !== 'number' ||
    !Number.isSafeInteger(savedAt) ||
    Date.now() - savedAt > PENDING_ORDER_MAXIMUM_AGE
  ) {
    clearPendingOrder();
    return undefined;
  }
  return { orderNo, savedAt };
};

const getVirtualPaymentErrorText = (error: VirtualPaymentError): string => {
  if (error.reason === 'not-supported') {
    return '当前微信版本暂不支持赞赏，请升级微信后重试';
  }
  if (error.errCode === -4) {
    return '支付暂时受限，请稍后再试';
  }
  if (error.errCode === -15020 || error.errCode === -15021) {
    return '操作太频繁，请稍后再试';
  }
  if (
    error.errCode === -15010 ||
    error.errCode === -15014 ||
    error.errCode === -15017 ||
    error.errCode === -15018 ||
    error.errCode === -15019
  ) {
    return '赞赏功能暂不可用，请稍后再试';
  }
  return '支付未完成，请稍后重试';
};

const getApiErrorText = (error: unknown): string => {
  if (ajax.isApiError(error, undefined, 'VIRTUAL_PAYMENT_UNAVAILABLE')) {
    return '赞赏功能暂不可用，请稍后再试';
  }
  if (ajax.isApiError(error, undefined, 'TIP_ORDER_RATE_LIMITED')) {
    return '操作太频繁，请稍后再试';
  }
  if (ajax.isApiError(error, undefined, 'TIP_AMOUNT_INVALID')) {
    return '请选择 1 至 200 元的整数金额';
  }
  if (
    ajax.isApiError(error, undefined, 'WECHAT_LOGIN_INVALID') ||
    ajax.isApiError(error, undefined, 'WECHAT_ACCOUNT_MISMATCH')
  ) {
    return '微信登录状态已变化，请重新进入页面后再试';
  }
  return '赞赏暂时无法发起，请稍后重试';
};

Page({
  data: {
    actionLabel: '确认赞赏 ¥5',
    amountError: '',
    amountInput: '5',
    isPaying: false,
    lastOrderNo: '',
    paymentState: 'idle' as PaymentState,
    quickAmounts: QUICK_AMOUNTS,
    selectedAmount: 5
  },

  onLoad() {
    const pendingOrder = getPendingOrder();
    if (pendingOrder) {
      this.setData({
        actionLabel: '重新查询支付结果',
        lastOrderNo: pendingOrder.orderNo,
        paymentState: 'pending'
      });
    }
  },

  onShow() {
    if (
      this.data.paymentState === 'pending' &&
      this.data.lastOrderNo &&
      !this.data.isPaying
    ) {
      void this._refreshPendingOrder();
    }
  },

  onUnload() {
    paymentFlowVersion += 1;
  },

  selectQuickAmount(
    event: WechatMiniprogram.TouchEvent<
      WechatMiniprogram.IAnyObject,
      WechatMiniprogram.IAnyObject,
      { amount: number }
    >
  ) {
    if (this.data.isPaying || this.data.paymentState === 'pending') {
      return;
    }
    const amount = Number(event.currentTarget.dataset.amount);
    if (!QUICK_AMOUNTS.includes(amount as (typeof QUICK_AMOUNTS)[number])) {
      return;
    }
    this.setData({
      actionLabel: `确认赞赏 ¥${amount}`,
      amountError: '',
      amountInput: String(amount),
      paymentState: 'idle',
      selectedAmount: amount
    });
  },

  updateAmount(event: WechatMiniprogram.Input): string {
    const normalized = event.detail.value
      .replace(/\D/gu, '')
      .replace(/^0+/u, '')
      .slice(0, 3);
    const amount = Number(normalized);
    const error =
      normalized && amount > MAXIMUM_AMOUNT_YUAN
        ? `单次最多赞赏 ${MAXIMUM_AMOUNT_YUAN} 元`
        : '';
    this.setData({
      actionLabel:
        normalized && !error ? `确认赞赏 ¥${amount}` : '请输入赞赏金额',
      amountError: error,
      amountInput: normalized,
      paymentState: 'idle',
      selectedAmount: QUICK_AMOUNTS.includes(
        amount as (typeof QUICK_AMOUNTS)[number]
      )
        ? amount
        : 0
    });
    return normalized;
  },

  validateAmount() {
    const amount = Number(this.data.amountInput);
    this.setData({
      amountError:
        Number.isSafeInteger(amount) &&
        amount >= 1 &&
        amount <= MAXIMUM_AMOUNT_YUAN
          ? ''
          : `请输入 1 至 ${MAXIMUM_AMOUNT_YUAN} 元的整数金额`
    });
  },

  async handlePrimaryAction() {
    if (this.data.isPaying) {
      return;
    }
    if (this.data.paymentState === 'pending' && this.data.lastOrderNo) {
      await this._refreshPendingOrder();
      return;
    }

    const amount = Number(this.data.amountInput);
    if (
      !Number.isSafeInteger(amount) ||
      amount < 1 ||
      amount > MAXIMUM_AMOUNT_YUAN
    ) {
      this.setData({
        amountError: `请输入 1 至 ${MAXIMUM_AMOUNT_YUAN} 元的整数金额`
      });
      return;
    }
    if (!isVirtualPaymentSupported()) {
      messageBox.toast('当前微信版本暂不支持赞赏，请升级微信后重试');
      return;
    }
    if (!(await confirmAmount(amount))) {
      return;
    }

    const flowVersion = ++paymentFlowVersion;
    this.setData({
      actionLabel: '正在发起赞赏',
      amountError: '',
      isPaying: true,
      paymentState: 'idle'
    });
    try {
      const order = await this._startPayment(amount, true);
      savePendingOrder(order.orderNo);
      if (flowVersion !== paymentFlowVersion) {
        return;
      }
      this.setData({
        actionLabel: '正在确认支付结果',
        lastOrderNo: order.orderNo
      });
      const status = await this._pollOrder(order.orderNo, flowVersion);
      if (flowVersion !== paymentFlowVersion) {
        return;
      }
      this._applyOrderStatus(status, order.orderNo);
    } catch (error) {
      if (flowVersion !== paymentFlowVersion) {
        return;
      }
      if (
        error instanceof VirtualPaymentError &&
        error.reason === 'cancelled'
      ) {
        this._restoreIdleAction();
        return;
      }
      messageBox.toast(
        error instanceof VirtualPaymentError
          ? getVirtualPaymentErrorText(error)
          : getApiErrorText(error)
      );
      this._restoreIdleAction();
    } finally {
      if (flowVersion === paymentFlowVersion) {
        this.setData({ isPaying: false });
      }
    }
  },

  async _startPayment(
    amountYuan: number,
    canRetryPaymentSession: boolean
  ): Promise<CreateTipOrderResponse> {
    const order = await this._createOrder(amountYuan, true);
    try {
      await requestVirtualPayment(order.payment);
      return order;
    } catch (error) {
      if (canRetryPaymentSession && shouldRetryPaymentSession(error)) {
        return this._startPayment(amountYuan, false);
      }
      throw error;
    }
  },

  async _createOrder(
    amountYuan: number,
    canRetryUnauthorized: boolean
  ): Promise<CreateTipOrderResponse> {
    if (app.globalData.loginStatus !== 'ready') {
      await app.doLogin();
    }
    const loginCode = await getLoginCode();
    try {
      const { data } = await ajax.post<CreateTipOrderResponse>(
        '/tips/orders',
        {
          amountYuan,
          clientRequestId: createClientRequestId(),
          loginCode
        },
        {
          retryUnauthorized: false,
          showError: false,
          showLoading: false
        }
      );
      return data;
    } catch (error) {
      if (canRetryUnauthorized && ajax.isApiError(error, 401)) {
        await app.doLogin();
        return this._createOrder(amountYuan, false);
      }
      throw error;
    }
  },

  async _pollOrder(
    orderNo: string,
    flowVersion: number
  ): Promise<TipOrderStatus> {
    let lastStatus: TipOrderStatus = 'pending';
    for (const delay of ORDER_POLL_DELAYS) {
      if (flowVersion !== paymentFlowVersion) {
        return lastStatus;
      }
      if (delay > 0) {
        await wait(delay);
      }
      if (flowVersion !== paymentFlowVersion) {
        return lastStatus;
      }
      try {
        const { data } = await ajax.get<TipOrderResponse>(
          `/tips/orders/${encodeURIComponent(orderNo)}`,
          { showError: false, showLoading: false }
        );
        lastStatus = data.status;
        if (lastStatus !== 'pending') {
          return lastStatus;
        }
      } catch {
        // 短时网络错误继续轮询，最终统一进入待确认状态。
      }
    }
    return lastStatus;
  },

  async _refreshPendingOrder() {
    const orderNo = this.data.lastOrderNo;
    if (!orderNo || this.data.isPaying) {
      return;
    }
    const flowVersion = ++paymentFlowVersion;
    this.setData({ actionLabel: '正在查询支付结果', isPaying: true });
    try {
      const status = await this._pollOrder(orderNo, flowVersion);
      if (flowVersion === paymentFlowVersion) {
        this._applyOrderStatus(status, orderNo);
      }
    } finally {
      if (flowVersion === paymentFlowVersion) {
        this.setData({ isPaying: false });
      }
    }
  },

  _applyOrderStatus(status: TipOrderStatus, orderNo: string) {
    if (status === 'paid') {
      clearPendingOrder();
      wx.vibrateShort({ type: 'light' });
      this.setData({
        actionLabel: '再次赞赏',
        lastOrderNo: orderNo,
        paymentState: 'success'
      });
      return;
    }
    if (status === 'pending') {
      savePendingOrder(orderNo);
      this.setData({
        actionLabel: '重新查询支付结果',
        lastOrderNo: orderNo,
        paymentState: 'pending'
      });
      return;
    }
    messageBox.toast(
      status === 'refunded' ? '该笔赞赏已退款' : '该笔支付未完成'
    );
    clearPendingOrder();
    this._restoreIdleAction();
  },

  _restoreIdleAction() {
    const amount = Number(this.data.amountInput);
    this.setData({
      actionLabel:
        Number.isSafeInteger(amount) &&
        amount >= 1 &&
        amount <= MAXIMUM_AMOUNT_YUAN
          ? `确认赞赏 ¥${amount}`
          : '请输入赞赏金额',
      lastOrderNo: '',
      paymentState: 'idle'
    });
  }
});
