module.exports = () => {
  const message =
    'E2E_DATABASE_URL must be a postgres/postgresql URL for a disposable local moto_payment_e2e_* database, without query parameters or fragments';
  let url;
  try {
    url = new URL(process.env.E2E_DATABASE_URL ?? '');
  } catch {
    throw new Error(message);
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    !/^\/moto_payment_e2e_[a-z0-9_]+$/u.test(url.pathname) ||
    url.search ||
    url.hash
  ) {
    throw new Error(message);
  }

  // Runs before any suite is loaded, including AppModule / ConfigModule.
  // Never inherit the application's database or payment credentials from .env.
  process.env.E2E_DATABASE_URL = url.href;
  process.env.DATABASE_URL = url.href;
  process.env.NODE_ENV = 'test';
  process.env.WECHAT_CONFIG = 'wx-e2e-placeholder|placeholder-secret';
  process.env.R2_CONFIG =
    'placeholder-account|placeholder-key|placeholder-secret|placeholder-bucket|images';
  process.env.WECHAT_VPAY_CONFIG = '';
};
