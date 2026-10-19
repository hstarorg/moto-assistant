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
type OrderQueryResult = {
  status: TipOrderStatus | 'unavailable';
  message?: string;
};

const app = getApp<MotoAppOptions>();
const QUICK_AMOUNTS = [1, 5, 10] as const;
const MAXIMUM_AMOUNT_YUAN = 200;
const ORDER_POLL_DELAYS = [0, 800, 1200, 1800, 2400] as const;
const PENDING_ORDER_MAXIMUM_AGE = 24 * 60 * 60 * 1000;
const PENDING_ORDER_STORAGE_KEY = 'pendingTipOrder';
const DEFAULT_PENDING_MESSAGE =
  '微信可能需要一点时间同步结果，你可以稍后重新查询。';
const PENDING_EXPIRED_MESSAGE = '本地查询记录已过期，请先核对微信账单再赞赏';
let paymentFlowVersion = 0;

const getAmountError = (input: string): string => {
  const amount = Number(input);
  return /^\d+$/u.test(input) &&
    Number.isSafeInteger(amount) &&
    amount >= 1 &&
    amount <= MAXIMUM_AMOUNT_YUAN
    ? ''
    : `请输入 1 至 ${MAXIMUM_AMOUNT_YUAN} 元的整数金额`;
};

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

const savePendingOrder = (orderNo: string): number => {
  const savedAt = Date.now();
  try {
    wx.setStorageSync(PENDING_ORDER_STORAGE_KEY, {
      orderNo,
      savedAt
    } as StoredPendingOrder);
  } catch {
    throw new Error('无法保存支付记录，请稍后重试');
  }
  return savedAt;
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
    savedAt <= 0 ||
    savedAt > Date.now()
  ) {
    clearPendingOrder();
    return undefined;
  }
  return { orderNo, savedAt };
};

const reportPaymentFailure = (
  stage: 'create' | 'pay' | 'query',
  error: unknown,
  orderNo?: string
): void => {
  try {
    if (typeof wx.getRealtimeLogManager !== 'function') {
      return;
    }
    wx.getRealtimeLogManager().warn('tip_payment_failure', {
      stage,
      orderNo,
      code:
        error instanceof VirtualPaymentError
          ? Number.isSafeInteger(error.errCode)
            ? error.errCode
            : error.reason
          : (ajax.getErrorCode(error) ?? 'REQUEST_FAILED')
    });
  } catch {
    // 诊断日志不可影响支付与订单恢复。
  }
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

const isDefinitivePaymentFailure = (error: VirtualPaymentError): boolean => {
  return (
    error.reason === 'not-supported' ||
    error.reason === 'cancelled' ||
    [
      1001, -4, -15001, -15004, -15005, -15006, -15007, -15008, -15009, -15010,
      -15011, -15012, -15013, -15014, -15016, -15017, -15018, -15019, -15020,
      -15021
    ].includes(error.errCode ?? 0)
  );
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
  if (ajax.isApiError(error, undefined, 'TIP_ORDER_ENVIRONMENT_MISMATCH')) {
    return '支付环境已变化，请重新发起赞赏';
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
    pendingSavedAt: 0,
    pendingMessage: DEFAULT_PENDING_MESSAGE,
    paymentState: 'idle' as PaymentState,
    quickAmounts: QUICK_AMOUNTS,
    selectedAmount: 5
  },

  onLoad() {
    const pendingOrder = getPendingOrder();
    if (pendingOrder) {
      if (Date.now() - pendingOrder.savedAt > PENDING_ORDER_MAXIMUM_AGE) {
        clearPendingOrder();
        messageBox.toast(PENDING_EXPIRED_MESSAGE);
        return;
      }
      this.setData({
        actionLabel: '重新查询支付结果',
        lastOrderNo: pendingOrder.orderNo,
        pendingSavedAt: pendingOrder.savedAt,
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

  leavePendingOrder() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/mine/mine' }) });
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
    const input = event.detail.value;
    const normalized = /^\d+$/u.test(input)
      ? input.replace(/^0+(?=\d)/u, '')
      : input;
    const amount = Number(normalized);
    const error = normalized ? getAmountError(normalized) : '';
    this.setData({
      actionLabel:
        normalized && !error ? `确认赞赏 ¥${amount}` : '请输入赞赏金额',
      amountError: error,
      amountInput: normalized,
      paymentState: 'idle',
      selectedAmount:
        !error &&
        QUICK_AMOUNTS.includes(amount as (typeof QUICK_AMOUNTS)[number])
          ? amount
          : 0
    });
    return normalized;
  },

  validateAmount() {
    this.setData({
      amountError: getAmountError(this.data.amountInput)
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
    const amountError = getAmountError(this.data.amountInput);
    if (amountError) {
      this.setData({ amountError });
      return;
    }
    if (!isVirtualPaymentSupported()) {
      messageBox.toast('当前微信版本暂不支持赞赏，请升级微信后重试');
      return;
    }
    const flowVersion = ++paymentFlowVersion;
    this.setData({
      actionLabel: '正在发起赞赏',
      amountError: '',
      isPaying: true,
      lastOrderNo: '',
      paymentState: 'idle'
    });
    try {
      if (!(await confirmAmount(amount))) {
        if (flowVersion === paymentFlowVersion) {
          this._restoreIdleAction();
        }
        return;
      }
      if (flowVersion !== paymentFlowVersion) {
        return;
      }
      const order = await this._startPayment(amount, true, flowVersion);
      if (flowVersion !== paymentFlowVersion) {
        return;
      }
      await this._confirmOrder(order.orderNo, flowVersion);
    } catch (error) {
      if (flowVersion !== paymentFlowVersion) {
        return;
      }
      if (
        error instanceof VirtualPaymentError &&
        isDefinitivePaymentFailure(error)
      ) {
        clearPendingOrder();
        if (error.reason !== 'cancelled') {
          messageBox.toast(getVirtualPaymentErrorText(error));
        }
        this._restoreIdleAction();
        return;
      }
      if (this.data.lastOrderNo) {
        await this._confirmOrder(this.data.lastOrderNo, flowVersion);
        return;
      }
      reportPaymentFailure('create', error);
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
    canRetryPaymentSession: boolean,
    flowVersion: number
  ): Promise<CreateTipOrderResponse> {
    const order = await this._createOrder(amountYuan, true);
    if (flowVersion !== paymentFlowVersion) {
      return order;
    }
    const savedAt = savePendingOrder(order.orderNo);
    this.setData({
      lastOrderNo: order.orderNo,
      pendingSavedAt: savedAt,
      pendingMessage: DEFAULT_PENDING_MESSAGE,
      paymentState: 'pending'
    });
    try {
      await requestVirtualPayment(order.payment);
      return order;
    } catch (error) {
      if (!(
        error instanceof VirtualPaymentError && error.reason === 'cancelled'
      )) {
        reportPaymentFailure('pay', error, order.orderNo);
      }
      if (
        flowVersion === paymentFlowVersion &&
        canRetryPaymentSession &&
        shouldRetryPaymentSession(error)
      ) {
        clearPendingOrder();
        this.setData({ lastOrderNo: '', paymentState: 'idle' });
        return this._startPayment(amountYuan, false, flowVersion);
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
          showLoading: false,
          timeout: 10000
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
  ): Promise<OrderQueryResult> {
    for (const delay of ORDER_POLL_DELAYS) {
      if (flowVersion !== paymentFlowVersion) {
        return { status: 'pending' };
      }
      if (delay > 0) {
        await wait(delay);
      }
      if (flowVersion !== paymentFlowVersion) {
        return { status: 'pending' };
      }
      try {
        if (app.globalData.loginStatus !== 'ready') {
          await app.doLogin();
        }
        if (flowVersion !== paymentFlowVersion) {
          return { status: 'pending' };
        }
        const { data } = await ajax.get<TipOrderResponse>(
          `/tips/orders/${encodeURIComponent(orderNo)}`,
          { showError: false, showLoading: false, timeout: 8000 }
        );
        if (!['pending', 'paid', 'refunded', 'closed'].includes(data?.status)) {
          throw new Error('订单查询响应不正确');
        }
        if (data.status !== 'pending') {
          return { status: data.status };
        }
      } catch (error) {
        reportPaymentFailure('query', error, orderNo);
        if (ajax.isApiError(error, 404)) {
          return {
            status: 'unavailable',
            message: '该订单不存在或不属于当前微信账号'
          };
        }
        if (
          ajax.isApiError(error, undefined, 'TIP_ORDER_ENVIRONMENT_MISMATCH')
        ) {
          return {
            status: 'unavailable',
            message: '支付环境已变化，已退出旧订单查询'
          };
        }
        if (
          ajax.isApiError(error, 401) ||
          ajax.isApiError(error, 403) ||
          app.globalData.loginStatus !== 'ready'
        ) {
          return {
            status: 'pending',
            message: '登录状态暂不可用，请重新进入小程序后查询。'
          };
        }
        if (ajax.isApiError(error, undefined, 'REQUEST_TIMEOUT')) {
          return {
            status: 'pending',
            message: '查询超时，支付结果仍待确认，请稍后再查。'
          };
        }
        return {
          status: 'pending',
          message: '暂时无法查询支付结果，请稍后再查，避免重复付款。'
        };
      }
    }
    return { status: 'pending' };
  },

  async _confirmOrder(orderNo: string, flowVersion: number) {
    this.setData({ actionLabel: '正在确认支付结果', lastOrderNo: orderNo });
    const status = await this._pollOrder(orderNo, flowVersion);
    if (flowVersion === paymentFlowVersion) {
      this._applyOrderStatus(status, orderNo);
    }
  },

  async _refreshPendingOrder() {
    const orderNo = this.data.lastOrderNo;
    if (!orderNo || this.data.isPaying) {
      return;
    }
    if (
      this.data.pendingSavedAt &&
      Date.now() - this.data.pendingSavedAt > PENDING_ORDER_MAXIMUM_AGE
    ) {
      this._applyOrderStatus(
        { status: 'unavailable', message: PENDING_EXPIRED_MESSAGE },
        orderNo
      );
      return;
    }
    const flowVersion = ++paymentFlowVersion;
    this.setData({ actionLabel: '正在查询支付结果', isPaying: true });
    try {
      await this._confirmOrder(orderNo, flowVersion);
    } finally {
      if (flowVersion === paymentFlowVersion) {
        this.setData({ isPaying: false });
      }
    }
  },

  _applyOrderStatus(result: OrderQueryResult, orderNo: string) {
    const { status } = result;
    if (status === 'pending') {
      this.setData({
        actionLabel: '重新查询支付结果',
        lastOrderNo: orderNo,
        pendingMessage: result.message ?? DEFAULT_PENDING_MESSAGE,
        paymentState: 'pending'
      });
      return;
    }
    clearPendingOrder();
    if (status === 'paid') {
      wx.vibrateShort({ type: 'light' });
      this.setData({
        actionLabel: '再次赞赏',
        lastOrderNo: orderNo,
        paymentState: 'success'
      });
      return;
    }
    this._restoreIdleAction();
    messageBox.toast(
      status === 'unavailable'
        ? (result.message ?? '该订单暂不可查询')
        : status === 'refunded'
          ? '该笔赞赏已退款'
          : '该笔支付未完成'
    );
  },

  _restoreIdleAction() {
    const amount = Number(this.data.amountInput);
    this.setData({
      actionLabel: !getAmountError(this.data.amountInput)
        ? `确认赞赏 ¥${amount}`
        : '请输入赞赏金额',
      lastOrderNo: '',
      pendingSavedAt: 0,
      pendingMessage: DEFAULT_PENDING_MESSAGE,
      paymentState: 'idle'
    });
  }
});
