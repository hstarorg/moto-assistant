const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function setup() {
  const storage = new Map();
  const events = [];
  const notifications = [];
  const diagnostics = [];
  const payment = deferred();
  const created = {
    orderNo: 'MA12345678',
    amountYuan: 5,
    payment: {
      mode: 'short_series_goods',
      signData: '{}',
      paySig: 'test',
      signature: 'test'
    }
  };
  const wx = {
    canIUse: () => true,
    requestVirtualPayment(options) {
      events.push('payment');
      assert.ok(storage.has('pendingTipOrder'), 'persist before invoking WeChat');
      payment.promise.then(options.success, options.fail);
    },
    getRealtimeLogManager() {
      return { warn: (event, value) => diagnostics.push({ event, value }) };
    },
    navigateBack() {
      events.push('leave');
    },
    switchTab() {
      events.push('mine');
    },
    login({ success }) {
      success({ code: 'login-code' });
    },
    showModal({ success }) {
      success({ confirm: true });
    },
    getStorageSync(key) {
      return storage.get(key);
    },
    setStorageSync(key, value) {
      storage.set(key, value);
      events.push('saved');
    },
    removeStorageSync(key) {
      storage.delete(key);
    },
    vibrateShort() {}
  };
  class ApiError extends Error {
    constructor(statusCode, code) {
      super('private-response');
      this.statusCode = statusCode;
      this.code = code;
    }
  }
  const ajax = {
    post: async () => {
      events.push('created');
      return { data: created };
    },
    get: async () => ({ data: { status: 'pending' } }),
    isApiError: (error, statusCode, code) =>
      error instanceof ApiError &&
      (statusCode === undefined || error.statusCode === statusCode) &&
      (code === undefined || error.code === code),
    getErrorCode: error => (error instanceof ApiError ? error.code : undefined)
  };
  const app = {
    globalData: { loginStatus: 'ready' },
    async doLogin() {
      app.globalData.loginStatus = 'ready';
    }
  };
  // Exercise the real wrapper; fake only the native WeChat API boundary.
  const virtual = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(
    path.join(__dirname, '../utils/virtualPayment.ts'), 'utf8'
  ), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS }
  }).outputText, { wx, exports: virtual });
  let options;
  const source = readFileSync(
    path.join(__dirname, '../pages/tip/tip.ts'),
    'utf8'
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS
    }
  }).outputText;
  const context = {
    wx,
    exports: {},
    Page: value => {
      options = value;
    },
    getApp: () => app,
    setTimeout: callback => {
      callback();
      return 0;
    },
    require: name => {
      if (name.endsWith('/ajax')) return ajax;
      if (name.endsWith('/messageBox'))
        return { toast: value => notifications.push(value) };
      if (name.endsWith('/virtualPayment')) return virtual;
      throw new Error(`Unexpected import: ${name}`);
    }
  };
  vm.runInNewContext(compiled, context);
  function page() {
    return {
      ...options,
      data: { ...options.data },
      setData(value) {
        Object.assign(this.data, value);
      }
    };
  }
  return {
    page,
    storage,
    events,
    payment,
    ajax,
    wx,
    created,
    virtual,
    notifications,
    diagnostics,
    ApiError,
    app
  };
}

async function untilPayment(f) {
  for (let count = 0; count < 20 && !f.events.includes('payment'); count++) {
    await Promise.resolve();
  }
  assert.ok(f.events.includes('payment'));
}

test('persists before payment and restores the pending order after page unload', async () => {
  const f = setup();
  const first = f.page();
  const flow = first.handlePrimaryAction();
  await untilPayment(f);
  assert.deepEqual(f.events, ['created', 'saved', 'payment']);
  first.onUnload();
  f.payment.resolve();
  await flow;
  const reopened = f.page();
  reopened.onLoad();
  assert.equal(reopened.data.lastOrderNo, f.created.orderNo);
  assert.equal(reopened.data.paymentState, 'pending');
});

test('checks the existing order after an uncertain failure and blocks a second payment', async () => {
  const f = setup();
  const page = f.page();
  const flow = page.handlePrimaryAction();
  await untilPayment(f);
  f.payment.reject({ errCode: -1 });
  await flow;
  assert.equal(page.data.paymentState, 'pending');
  await page.handlePrimaryAction();
  assert.equal(f.events.filter(value => value === 'created').length, 1);
  assert.ok(f.storage.has('pendingTipOrder'));
});

test('recognizes a successful server order despite a failed client callback', async () => {
  const f = setup();
  f.ajax.get = async () => ({ data: { status: 'paid' } });
  const page = f.page();
  const flow = page.handlePrimaryAction();
  await untilPayment(f);
  f.payment.reject({});
  await flow;
  assert.equal(page.data.paymentState, 'success');
  assert.equal(f.storage.has('pendingTipOrder'), false);
  assert.equal(f.notifications.length, 0);
});

test('does not initiate payment when the page unloads during order creation', async () => {
  const f = setup();
  const creation = deferred();
  f.ajax.post = () => creation.promise;
  const page = f.page();
  const flow = page.handlePrimaryAction();
  await Promise.resolve();
  await Promise.resolve();
  page.onUnload();
  creation.resolve({ data: f.created });
  await flow;
  assert.equal(f.events.includes('payment'), false);
});

test('does not initiate payment when the order cannot be persisted', async () => {
  const f = setup();
  f.wx.setStorageSync = () => {
    throw new Error('storage full');
  };
  const page = f.page();
  await page.handlePrimaryAction();
  assert.equal(f.events.includes('payment'), false);
  assert.equal(page.data.isPaying, false);
});

test('clears a definitively cancelled order without an error notification', async () => {
  const f = setup();
  const page = f.page();
  const flow = page.handlePrimaryAction();
  await untilPayment(f);
  f.payment.reject({ errCode: -2 });
  await flow;
  assert.equal(page.data.paymentState, 'idle');
  assert.equal(f.storage.has('pendingTipOrder'), false);
  assert.equal(f.notifications.length, 0);
});

test('locks repeat taps while the confirmation dialog is still open', async () => {
  const f = setup();
  let confirm;
  f.wx.showModal = ({ success }) => {
    confirm = success;
  };
  const page = f.page();
  const first = page.handlePrimaryAction();
  await page.handlePrimaryAction();
  assert.equal(f.events.includes('created'), false);
  confirm({ confirm: true });
  await untilPayment(f);
  f.payment.resolve();
  await first;
  assert.equal(f.events.filter(value => value === 'created').length, 1);
});

test('retries an expired payment session once and persists the replacement order', async () => {
  const f = setup();
  let attempt = 0;
  f.ajax.post = async () => {
    attempt += 1;
    return { data: { ...f.created, orderNo: `MA1234567${attempt}` } };
  };
  f.wx.requestVirtualPayment = options => {
    assert.equal(
      f.storage.get('pendingTipOrder').orderNo,
      `MA1234567${attempt}`
    );
    options.fail({ errCode: -15007 });
  };
  const page = f.page();
  await page.handlePrimaryAction();
  assert.equal(attempt, 2);
  assert.equal(page.data.isPaying, false);
  assert.equal(f.storage.has('pendingTipOrder'), false);
});

test('native numeric failure codes take precedence over ambiguous cancel text', async () => {
  const f = setup();
  f.wx.requestVirtualPayment = options => options.fail({
    errCode: -15010,
    // Synthetic hostile text, not a captured WeChat errmsg.
    errMsg: 'requestVirtualPayment:fail product unavailable; not cancelled'
  });
  await assert.rejects(f.virtual.requestVirtualPayment(f.created.payment), error => {
    assert.equal(error.reason, 'failed');
    assert.equal(error.errCode, -15010);
    return true;
  });
});

test('native payment parameters pass through without parsing or resigning signData', async () => {
  const f = setup();
  f.wx.requestVirtualPayment = options => {
    assert.equal(options.mode, 'short_series_goods');
    assert.equal(options.signData, '{}');
    assert.equal(options.paySig, 'test');
    assert.equal(options.signature, 'test');
    options.success({ errMsg: 'requestVirtualPayment:ok' });
  };
  await f.virtual.requestVirtualPayment(f.created.payment);
});

test('native documented signature and session errors are distinguished from cancellation and unknown results', async () => {
  // wx.requestVirtualPayment official error table; the one-retry choice is our policy.
  for (const [errCode, reason, retry] of [
    [-2, 'cancelled', false],
    [-15005, 'failed', true],
    [-15007, 'failed', true],
    [-15006, 'failed', false],
    [-1, 'failed', false],
    [-5, 'failed', false],
    [-99999, 'failed', false]
  ]) {
    const f = setup();
    f.wx.requestVirtualPayment = options => options.fail({ errCode });
    await assert.rejects(f.virtual.requestVirtualPayment(f.created.payment), error => {
      assert.equal(error.reason, reason);
      assert.equal(error.errCode, errCode);
      assert.equal(f.virtual.shouldRetryPaymentSession(error), retry);
      return true;
    });
  }
});

test('native unsupported payment never creates a backend order', async () => {
  for (const supported of [false, true]) {
    const f = setup();
    f.wx.canIUse = () => supported;
    if (supported) delete f.wx.requestVirtualPayment;
    await f.page().handlePrimaryAction();
    assert.equal(f.events.includes('created'), false);
    assert.equal(f.events.includes('payment'), false);
  }
});

test('does not use a previous successful order if starting the next payment fails', async () => {
  const f = setup();
  const page = f.page();
  page.data.lastOrderNo = 'MAPREVIOUS123';
  page.data.paymentState = 'success';
  f.ajax.post = async () => {
    throw new Error('offline');
  };
  let queries = 0;
  f.ajax.get = async () => {
    queries += 1;
    return { data: { status: 'paid' } };
  };
  await page.handlePrimaryAction();
  assert.equal(queries, 0);
  assert.equal(page.data.paymentState, 'idle');
});

function pendingPage(f) {
  f.storage.set('pendingTipOrder', {
    orderNo: f.created.orderNo,
    savedAt: Date.now()
  });
  const page = f.page();
  page.onLoad();
  return page;
}

test('waits for login and clears inaccessible pending records after an account switch', async () => {
  const f = setup();
  const page = pendingPage(f);
  f.app.globalData.loginStatus = 'loggingIn';
  let queries = 0;
  f.ajax.get = async () => {
    assert.equal(f.app.globalData.loginStatus, 'ready');
    queries += 1;
    throw new f.ApiError(404, 'TIP_ORDER_NOT_FOUND');
  };
  await page._refreshPendingOrder();
  assert.equal(page.data.paymentState, 'idle');
  assert.equal(page.data.isPaying, false);
  assert.equal(f.storage.has('pendingTipOrder'), false);
  assert.equal(queries, 1);
});

test('leaves an old-environment pending record without claiming the payment failed', async () => {
  const f = setup();
  const page = pendingPage(f);
  f.ajax.get = async () => {
    throw new f.ApiError(409, 'TIP_ORDER_ENVIRONMENT_MISMATCH');
  };
  await page._refreshPendingOrder();
  assert.equal(page.data.paymentState, 'idle');
  assert.equal(f.storage.has('pendingTipOrder'), false);
  assert.ok(f.notifications.some(value => value.includes('支付环境已变化')));
});

test('keeps uncertain orders with a retry message and an unchanged expiration time', async () => {
  const f = setup();
  const page = pendingPage(f);
  const savedAt = f.storage.get('pendingTipOrder').savedAt;
  let queries = 0;
  f.ajax.get = async (_path, options) => {
    assert.equal(options.timeout, 8000);
    queries += 1;
    throw new f.ApiError(503, 'TIP_ORDER_QUERY_FAILED');
  };
  await page._refreshPendingOrder();
  assert.equal(page.data.isPaying, false);
  assert.equal(page.data.paymentState, 'pending');
  assert.ok(page.data.pendingMessage.includes('避免重复付款'));
  assert.equal(queries, 1);
  assert.equal(f.storage.get('pendingTipOrder').savedAt, savedAt);
  page.leavePendingOrder();
  assert.ok(f.events.includes('leave'));
  assert.ok(f.storage.has('pendingTipOrder'));
});

test('keeps pending orders when authorization cannot be recovered', async () => {
  const f = setup();
  const page = pendingPage(f);
  f.app.globalData.loginStatus = 'failed';
  f.app.doLogin = async () => {
    throw new f.ApiError(401);
  };
  await page._refreshPendingOrder();
  assert.equal(page.data.paymentState, 'pending');
  assert.ok(page.data.pendingMessage.includes('登录状态'));
  assert.ok(f.storage.has('pendingTipOrder'));
});

test('releases records that expire while the page stays open and reminds the user to check the bill', async () => {
  const f = setup();
  const page = pendingPage(f);
  page.data.pendingSavedAt = Date.now() - 24 * 60 * 60 * 1000 - 1;
  await page._refreshPendingOrder();
  assert.equal(page.data.paymentState, 'idle');
  assert.equal(f.storage.has('pendingTipOrder'), false);
  assert.ok(f.notifications.some(value => value.includes('核对微信账单')));
});

test('records the actual WeChat failure code without payment signatures or raw error messages', async () => {
  const f = setup();
  const page = f.page();
  const flow = page.handlePrimaryAction();
  await untilPayment(f);
  f.payment.reject({
    errCode: -15010,
    errMsg: 'private-error-with-signature'
  });
  await flow;
  assert.equal(f.diagnostics.length, 1);
  assert.equal(f.diagnostics[0].value.code, -15010);
  assert.equal(f.diagnostics[0].value.orderNo, f.created.orderNo);
  const text = JSON.stringify(f.diagnostics);
  assert.equal(text.includes('signature'), false);
  assert.equal(text.includes('paySig'), false);
  assert.equal(text.includes('private-error'), false);
});

test('diagnostic logger failures cannot interrupt order recovery', async () => {
  const f = setup();
  f.wx.getRealtimeLogManager = () => {
    throw new Error('logging unavailable');
  };
  const page = pendingPage(f);
  f.ajax.get = async () => {
    throw new f.ApiError(404);
  };
  await page._refreshPendingOrder();
  assert.equal(page.data.isPaying, false);
  assert.equal(page.data.paymentState, 'idle');
});

test('warns about an expired record when reopening the page', () => {
  const f = setup();
  f.storage.set('pendingTipOrder', {
    orderNo: f.created.orderNo,
    savedAt: Date.now() - 24 * 60 * 60 * 1000 - 1
  });
  const page = f.page();
  page.onLoad();
  assert.equal(page.data.paymentState, 'idle');
  assert.equal(f.storage.has('pendingTipOrder'), false);
  assert.ok(f.notifications.some(value => value.includes('核对微信账单')));
});

test('rejects invalid amounts without turning them into another payable amount', async () => {
  for (const value of ['1.5', '-5', '1e2', '1000']) {
    const f = setup();
    const page = f.page();
    page.updateAmount({ detail: { value } });
    assert.ok(page.data.amountError, `${value} must be rejected`);
    await page.handlePrimaryAction();
    assert.equal(f.events.includes('created'), false);
  }
});
