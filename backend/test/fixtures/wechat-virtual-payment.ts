// Provenance, sanitization and limits: docs/payment-test-review.md.
// Selected fields of the production query response observed on 2026-10-19.
// Identifiers replaced; absent refund_fee intentionally NOT added.
export const observedPaidOrder = {
  errcode: 0,
  order: {
    order_id: 'MA1234567890ABCDEF',
    env_type: 1,
    order_type: 0,
    status: 3,
    order_fee: 100,
    paid_fee: 100,
    paid_time: 1792397607,
    left_fee: 100,
    wx_order_id: 'wx-order-redacted',
  },
};

// Official message-push.html JSON safe-mode worked example, NOT a payment push.
// All credentials/identifiers below are public example values, not our .env.
export const officialJsonMessage = {
  appId: 'wxba5fad812f8e6fb9',
  encodingAesKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  messageToken: 'AAAAA',
  timestamp: '1714112445',
  nonce: '415670741',
  signature: '046e02f8204d34f8ba5fa3b1db94908f3df2e9b3',
  encrypted:
    '+qdx1OKCy+5JPCBFWw70tm0fJGb2Jmeia4FCB7kao+/Q5c/ohsOzQHi8khUOb05JCpj0JB4RvQMkUyus8TPxLKJGQqcvZqzDpVzazhZv6JsXUnnR8XGT740XgXZUXQ7vJVnAG+tE8NUd4yFyjPy7GgiaviNrlCTj+l5kdfMuFUPpRSrfMZuMcp3Fn2Pede2IuQrKEYwKSqFIZoNqJ4M8EajAsjLY2km32IIjdf8YL/P50F7mStwntrA2cPDrM1kb6mOcfBgRtWygb3VIYnSeOBrebufAlr7F9mFUPAJGj04=',
  plaintext:
    '{"ToUserName":"gh_97417a04a28d","FromUserName":"o9AgO5Kd5ggOC-bXrbNODIiE3bGY","CreateTime":1714112445,"MsgType":"event","Event":"debug_demo","debug_str":"hello world"}',
};

// Independently calculated using Python hmac/hashlib, following the official
// virtual-payment.html §2.5/2.6 algorithm. These are synthetic worked vectors.
export const paymentSigningVector = {
  sessionKey: '9hAb/NEYUlkaMBEsmFgzig==',
  signData:
    '{"offerId":"offer-123","buyQuantity":5,"env":0,"currencyType":"CNY","productId":"zanshang","goodsPrice":100,"outTradeNo":"MA1234567890ABCDEF","attach":"MA1234567890ABCDEF"}',
  paySig: 'a1d3e03c9f7bcf6cf43150c83f7cd2e88e028bc79a6d4d15eb3561c510ba3853',
  signature: 'b67b77a2e95468353c853d6adf833af4c72f40a50cad0fa937f9c8e2cf6e2701',
};

export const querySigningVectors = [
  {
    environment: 0,
    body: '{"openid":"openid-1","env":0,"order_id":"MA1234567890ABCDEF"}',
    paySig: '38ab22a630e019649ca9d4bcc9b217764c8f9e255d2a9e9bcf95cb41331b7d30',
  },
  {
    environment: 1,
    body: '{"openid":"openid-1","env":1,"order_id":"MA1234567890ABCDEF"}',
    paySig: 'c6794cab3cbbe9e6d224262153cb6f44c2b7a088fae1391b714b483c92942ac1',
  },
] as const;
