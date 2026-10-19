import {
  BadRequestException,
  type INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  createCipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { ApiExceptionFilter } from '../src/common';
import { ALL_ENTITIES, DATABASE_SCHEMA, TipOrderEntity } from '../src/database';
import { InitTables1786180634310 } from '../src/database/migrations/1786180634310-InitTables';
import { AddArchiveAndFuelSoftDelete1787630400000 } from '../src/database/migrations/1787630400000-AddArchiveAndFuelSoftDelete';
import { AddTipOrders1788406303959 } from '../src/database/migrations/1788406303959-AddTipOrders';
import {
  observedPaidOrder,
  officialJsonMessage,
} from './fixtures/wechat-virtual-payment';
import {
  type AccountTokenResponse,
  type CreateTipOrderResponse,
  type TipOrderResponse,
  TipService,
} from '../src/services';

jest.setTimeout(30_000);

interface RemoteOrder {
  env_type: number;
  order_id: string;
  order_type: number;
  order_fee: number;
  status: number;
  paid_fee: number;
  paid_time: number;
  refund_fee?: number;
  left_fee: number;
  wx_order_id: string;
}

describe('Virtual payment HTTP flow (real PostgreSQL, protocol-based WeChat simulator; not live acceptance)', () => {
  let app: INestApplication<App>;
  let database: DataSource;
  let token: string;
  let otherToken: string;
  const appId = officialJsonMessage.appId;
  const messageToken = officialJsonMessage.messageToken;
  const aesKey = Buffer.from(
    `${officialJsonMessage.encodingAesKey}=`,
    'base64',
  );
  const remoteOrders = new Map<string, RemoteOrder>();
  const queriedOrders: string[] = [];
  const deliveredOrders: string[] = [];
  const runId = randomUUID();
  let deliveryFailure = false;

  // Synthetic payment event transport per message-push.html. Crypto compatibility
  // is anchored separately by the official fixed JSON ciphertext in the SDK tests.
  const push = (payload: Record<string, unknown>, validSignature = true) => {
    const json = Buffer.from(JSON.stringify(payload));
    const length = Buffer.alloc(4);
    length.writeUInt32BE(json.length);
    const packed = Buffer.concat([
      randomBytes(16),
      length,
      json,
      Buffer.from(appId),
    ]);
    const padding = 32 - (packed.length % 32);
    const cipher = createCipheriv(
      'aes-256-cbc',
      aesKey,
      aesKey.subarray(0, 16),
    );
    cipher.setAutoPadding(false);
    const encrypted = Buffer.concat([
      cipher.update(Buffer.concat([packed, Buffer.alloc(padding, padding)])),
      cipher.final(),
    ]).toString('base64');
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = 'test-nonce';
    const signature = createHash('sha1')
      .update([messageToken, timestamp, nonce, encrypted].sort().join(''))
      .digest('hex');
    return request(app.getHttpServer())
      .post('/api/v1/wechat/messages')
      .query({
        encrypt_type: 'aes',
        timestamp,
        nonce,
        msg_signature: validSignature ? signature : '0'.repeat(40),
      })
      .send({ Encrypt: encrypted });
  };

  const createOrder = async (
    amountYuan = 5,
    clientRequestId = randomUUID(),
  ) => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/tips/orders')
      .set('x-ma-token', token)
      .send({ amountYuan, clientRequestId, loginCode: 'payer' })
      .expect(201);
    const order = response.body as CreateTipOrderResponse;
    remoteOrders.set(order.orderNo, {
      env_type: 1,
      order_id: order.orderNo,
      order_type: 0,
      order_fee: amountYuan * 100,
      status: 1,
      paid_fee: 0,
      paid_time: 0,
      left_fee: 0,
      wx_order_id: `wx-${order.orderNo}`,
    });
    return order;
  };

  const queryOrder = async (orderNo: string) => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/tips/orders/${orderNo}`)
      .set('x-ma-token', token)
      .expect(200);
    return response.body as TipOrderResponse;
  };

  const remoteOrder = (orderNo: string): RemoteOrder => {
    const order = remoteOrders.get(orderNo);
    if (!order) throw new Error('Missing fake WeChat order');
    return order;
  };

  const pay = (orderNo: string) => {
    const order = remoteOrder(orderNo);
    Object.assign(order, {
      status: 2,
      paid_fee: order.order_fee,
      left_fee: order.order_fee,
      paid_time: Math.floor(Date.now() / 1000),
    });
  };

  beforeAll(async () => {
    // Validated by the shared globalSetup before any suite/application loads.
    const databaseUrl = process.env.E2E_DATABASE_URL;
    database = new DataSource({
      type: 'postgres',
      url: databaseUrl,
      entities: ALL_ENTITIES,
      migrations: [
        InitTables1786180634310,
        AddArchiveAndFuelSoftDelete1787630400000,
        AddTipOrders1788406303959,
      ],
      synchronize: false,
    });
    await database.initialize();
    const runner = database.createQueryRunner();
    try {
      await runner.createSchema(DATABASE_SCHEMA, true);
    } finally {
      await runner.release();
    }
    await database.runMigrations();

    // Real application/SDK/guard/database; only the external WeChat HTTP boundary is fake.
    jest.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (url.origin !== 'https://api.weixin.qq.com') {
        throw new Error('Unexpected external HTTP request');
      }
      if (url.pathname === '/sns/jscode2session') {
        return Promise.resolve(
          Response.json({
            openid: `${runId}-${url.searchParams.get('js_code')}`,
            session_key: Buffer.alloc(16, 2).toString('base64'),
          }),
        );
      }
      if (url.pathname === '/cgi-bin/token') {
        return Promise.resolve(
          Response.json({
            access_token: 'test-access-token',
            expires_in: 7200,
          }),
        );
      }
      if (typeof init?.body !== 'string') {
        throw new Error('Expected a JSON request body');
      }
      const body = JSON.parse(init.body) as {
        order_id: string;
        env: number;
        openid?: string;
      };
      expect(body.env).toBe(0);
      // Official §2.5 signs the ACTUAL bytes, not reserialized JSON. This is an
      // independent boundary validator, never a call to the SDK signing helper.
      const expectedSignature = createHmac('sha256', 'placeholder-key')
        .update(`${url.pathname}&${init.body}`)
        .digest('hex');
      if (
        url.searchParams.has('pay_sig') &&
        url.searchParams.get('pay_sig') !== expectedSignature
      ) {
        return Promise.resolve(Response.json({ errcode: 268490003 }));
      }
      expect(url.searchParams.get('access_token')).toBe('test-access-token');
      expect(init.method).toBe('POST');
      if (url.pathname === '/xpay/query_order') {
        if (!url.searchParams.get('pay_sig')) {
          return Promise.resolve(Response.json({ errcode: 268490002 }));
        }
        expect(body.openid).toBe(`${runId}-payer`);
        queriedOrders.push(body.order_id);
        return Promise.resolve(
          Response.json({ errcode: 0, order: remoteOrder(body.order_id) }),
        );
      }
      if (url.pathname === '/xpay/notify_provide_goods') {
        if (!url.searchParams.get('pay_sig')) {
          return Promise.resolve(Response.json({ errcode: 268490002 }));
        }
        deliveredOrders.push(body.order_id);
        remoteOrder(body.order_id).status = 4;
        if (deliveryFailure) {
          // The provider applied the operation, but its response was lost.
          return Promise.reject(new Error('Synthetic lost delivery response'));
        }
        return Promise.resolve(Response.json({ errcode: 0 }));
      }
      throw new Error(`Unexpected WeChat path: ${url.pathname}`);
    });
    const config = new ConfigService({
      DATABASE_URL: databaseUrl,
      NODE_ENV: 'test',
      R2_CONFIG:
        'placeholder-account|placeholder-key|placeholder-secret|placeholder-bucket|images',
      WECHAT_CONFIG: `${appId}|placeholder-secret`,
      WECHAT_VPAY_CONFIG: `placeholder-offer|placeholder-key|production|${messageToken}|${aesKey.toString('base64').slice(0, 43)}`,
    });
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ConfigService)
      .useValue(config)
      .compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ApiExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        exceptionFactory: () => new BadRequestException('请求参数不正确'),
        forbidNonWhitelisted: true,
        transform: true,
        whitelist: true,
      }),
    );
    await app.init();
    for (const code of ['payer', 'other']) {
      const response = await request(app.getHttpServer())
        .post('/api/v1/account/token')
        .send({ code })
        .expect(200);
      const account = response.body as AccountTokenResponse;
      if (code === 'payer') token = account.token;
      else otherToken = account.token;
    }
  });

  afterEach(() => {
    deliveryFailure = false;
  });

  afterAll(async () => {
    await app?.close();
    await database?.destroy();
    jest.restoreAllMocks();
  });

  it('requires authentication and rejects non-integer JSON amounts', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/tips/orders')
      .send({})
      .expect(401);
    for (const amountYuan of [0, -1, 1.5, 201, true, '5']) {
      await request(app.getHttpServer())
        .post('/api/v1/tips/orders')
        .set('x-ma-token', token)
        .send({ amountYuan, clientRequestId: randomUUID(), loginCode: 'payer' })
        .expect(400);
    }
  });

  it('reuses a global request ID only for the same owner and amount', async () => {
    const clientRequestId = randomUUID();
    const order = await createOrder(5, clientRequestId);
    const repeat = await createOrder(5, clientRequestId);
    expect(repeat.orderNo).toBe(order.orderNo);
    expect(JSON.parse(repeat.payment.signData) as unknown).toMatchObject({
      productId: 'zanshang',
      goodsPrice: 100,
      buyQuantity: 5,
    });
    for (const [auth, amountYuan, loginCode] of [
      [token, 10, 'payer'],
      [otherToken, 5, 'other'],
    ] as const) {
      await request(app.getHttpServer())
        .post('/api/v1/tips/orders')
        .set('x-ma-token', auth)
        .send({ amountYuan, clientRequestId, loginCode })
        .expect(409);
    }
    await request(app.getHttpServer())
      .get(`/api/v1/tips/orders/${order.orderNo}`)
      .set('x-ma-token', otherToken)
      .expect(404);
    pay(order.orderNo);
    expect((await queryOrder(order.orderNo)).status).toBe('paid');
    expect(
      deliveredOrders.filter((orderNo) => orderNo === order.orderNo),
    ).toHaveLength(1);
  });

  it('allows the same user to tip again using a fresh request and order ID', async () => {
    const first = await createOrder(1);
    pay(first.orderNo);
    expect((await queryOrder(first.orderNo)).status).toBe('paid');
    const second = await createOrder(1);
    expect(second.orderNo).not.toBe(first.orderNo);
    pay(second.orderNo);
    expect((await queryOrder(second.orderNo)).status).toBe('paid');
  });

  it('does not trust callback payment fields and handles duplicate JSON pushes', async () => {
    const order = await createOrder();
    const payload = {
      Event: 'xpay_goods_deliver_notify',
      OutTradeNo: order.orderNo,
      // These are documented callback fields with deliberately false values.
      OpenId: 'untrusted-openid',
      GoodsInfo: {
        ProductId: 'untrusted-product',
        Quantity: 999,
        ActualPrice: 1,
      },
      WeChatPayInfo: { MchOrderNo: 'untrusted-wx-order', PaidTime: 1 },
    };
    await push(payload, false).expect(403);
    expect(queriedOrders).not.toContain(order.orderNo);
    await push(payload).expect(503);
    expect((await queryOrder(order.orderNo)).status).toBe('pending');
    pay(order.orderNo);
    await push(payload).expect(200, { ErrCode: 0, ErrMsg: 'success' });
    const paid = await queryOrder(order.orderNo);
    await push(payload).expect(200);
    expect(await queryOrder(order.orderNo)).toMatchObject({
      status: 'paid',
      paidAt: paid.paidAt,
    });
  });

  it('replays the sanitized production response through HTTP without adding refund_fee', async () => {
    const order = await createOrder(1);
    // Adapt both redacted identifiers per run: wx_order_id is globally unique,
    // including when the same disposable database is reused for another run.
    remoteOrders.set(order.orderNo, {
      ...observedPaidOrder.order,
      order_id: order.orderNo,
      wx_order_id: `wx-${runId}-redacted`,
    });
    expect(await queryOrder(order.orderNo)).toMatchObject({
      status: 'paid',
      amountYuan: 1,
      paidAt: new Date(1792397607 * 1000).toISOString(),
    });
    expect(deliveredOrders).toContain(order.orderNo);
  });

  it('does not report an unknown official JSON event as a payment', async () => {
    const queriesBefore = queriedOrders.length;
    // Exact official ciphertext/signature: no local encryptor involved.
    await request(app.getHttpServer())
      .post('/api/v1/wechat/messages')
      .query({
        encrypt_type: 'aes',
        timestamp: officialJsonMessage.timestamp,
        nonce: officialJsonMessage.nonce,
        signature: '6c5c811b55cc85e0e1b54100749188c20beb3f5d',
        msg_signature: officialJsonMessage.signature,
      })
      .send({ Encrypt: officialJsonMessage.encrypted })
      .expect(200, { ErrCode: 0, ErrMsg: 'success' });
    expect(queriedOrders).toHaveLength(queriesBefore);
  });

  it('recovers a lost delivery response using active queries rather than charging again', async () => {
    const order = await createOrder(1);
    pay(order.orderNo);
    deliveryFailure = true;
    await request(app.getHttpServer())
      .get(`/api/v1/tips/orders/${order.orderNo}`)
      .set('x-ma-token', token)
      .expect(503);
    deliveryFailure = false;
    await app.get(TipService).reconcileOrders(0);
    expect((await queryOrder(order.orderNo)).status).toBe('paid');
    expect(
      deliveredOrders.filter((orderNo) => orderNo === order.orderNo),
    ).toHaveLength(1);
  });

  it('does not deliver when a real database transaction rolls back before commit', async () => {
    const order = await createOrder(1);
    pay(order.orderNo);
    const applicationDatabase = app.get(DataSource);
    const fault = {
      beforeTransactionCommit() {
        throw new Error('Synthetic database commit failure');
      },
    };
    // Inject a failure at the database boundary, not a mock TipService/repository.
    applicationDatabase.subscribers.push(fault);
    try {
      await request(app.getHttpServer())
        .get(`/api/v1/tips/orders/${order.orderNo}`)
        .set('x-ma-token', token)
        .expect(500);
      expect(deliveredOrders).not.toContain(order.orderNo);
    } finally {
      applicationDatabase.subscribers.splice(
        applicationDatabase.subscribers.indexOf(fault),
        1,
      );
    }
    // Observe rollback through the HTTP contract, not by reading database rows.
    Object.assign(remoteOrder(order.orderNo), {
      status: 1,
      paid_fee: 0,
      paid_time: 0,
      left_fee: 0,
    });
    expect((await queryOrder(order.orderNo)).status).toBe('pending');
    pay(order.orderNo);
    expect((await queryOrder(order.orderNo)).status).toBe('paid');
    expect(deliveredOrders).toContain(order.orderNo);
  });

  it('queries the refund and original order before accepting a full refund', async () => {
    const order = await createOrder();
    pay(order.orderNo);
    const paid = await queryOrder(order.orderNo);
    const refundId = `refund-${randomUUID().slice(0, 20)}`;
    remoteOrders.set(refundId, {
      ...remoteOrder(order.orderNo),
      order_id: refundId,
      order_type: 1,
      status: 5,
      refund_fee: 500,
      wx_order_id: `wx-${refundId}`,
    });
    const payload = {
      Event: 'xpay_refund_notify',
      MchOrderId: order.orderNo,
      MchRefundId: refundId,
    };
    await push(payload).expect(503);
    expect((await queryOrder(order.orderNo)).status).toBe('paid');
    remoteOrder(refundId).status = 7;
    await push(payload).expect(200);
    expect((await queryOrder(order.orderNo)).status).toBe('paid');
    remoteOrder(refundId).status = 8;
    await push(payload).expect(503); // Original order has not corroborated the refund yet.
    remoteOrder(order.orderNo).left_fee = 0;
    await push(payload).expect(200);
    await push(payload).expect(200);
    expect(await queryOrder(order.orderNo)).toMatchObject({
      status: 'refunded',
      paidAt: paid.paidAt,
    });
    expect(queriedOrders).toContain(refundId);
  });

  it('automatically reconciles only recent orders; old orders remain explicitly queryable', async () => {
    const recent = await createOrder();
    const old = await createOrder();
    await database.getRepository(TipOrderEntity).update(
      { outTradeNo: old.orderNo },
      {
        createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      },
    );
    pay(recent.orderNo);
    pay(old.orderNo);
    queriedOrders.length = 0;
    await app.get(TipService).reconcileOrders(0);
    expect(queriedOrders).toContain(recent.orderNo);
    expect(queriedOrders).not.toContain(old.orderNo);
    expect((await queryOrder(old.orderNo)).status).toBe('paid');
  });
});
