import {
  BadRequestException,
  type INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { ApiExceptionFilter } from '../src/common';
import {
  type AccountTokenResponse,
  type FuelListResponse,
  type MotoResponse,
  ThirdPartyService,
} from '../src/services';

jest.setTimeout(30_000);

describe('API positive flow (e2e)', () => {
  let app: INestApplication<App> | undefined;

  const openId = `e2e-${randomUUID()}`;
  const motoName = `集成测试车辆-${randomUUID().slice(0, 8)}`;
  const motoPhotoKey = `e2e/${randomUUID()}.jpg`;
  const motoPhotoUrl = `https://images.example.com/e2e/${randomUUID()}.jpg`;
  const thirdParty = {
    getImageUrl: jest.fn().mockResolvedValue(motoPhotoUrl),
    getWechatOpenId: jest.fn().mockResolvedValue(openId),
    uploadImage: jest.fn().mockResolvedValue(motoPhotoKey),
  };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ThirdPartyService)
      .useValue(thirdParty)
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
  });

  it('creates a user, a moto and a fuel record', async () => {
    if (!app) {
      throw new Error('测试应用未初始化');
    }

    const accountResponse = await request(app.getHttpServer())
      .post('/api/v1/account/token')
      .send({ code: 'e2e-code' })
      .expect(200);
    const account = accountResponse.body as AccountTokenResponse;
    expect(account).toEqual({ token: expect.any(String) });

    await request(app.getHttpServer())
      .post('/api/v1/motos')
      .set('x-ma-token', account.token)
      .field('motoName', motoName)
      .field('motoBuyDate', '2026-08-01')
      .field('motoLicensePlate', '测试牌照')
      .attach('file', Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
        contentType: 'image/jpeg',
        filename: 'moto.jpg',
      })
      .expect(201);

    const motosResponse = await request(app.getHttpServer())
      .get('/api/v1/motos')
      .set('x-ma-token', account.token)
      .expect(200);
    const motos = motosResponse.body as MotoResponse[];
    expect(motos).toHaveLength(1);
    expect(motos[0]).toEqual(
      expect.objectContaining({
        motoName,
        motoPhotoUrl,
        status: 'active',
      }),
    );

    const motoId = motos[0].id;
    await request(app.getHttpServer())
      .post(`/api/v1/motos/${motoId}/fuel`)
      .set('x-ma-token', account.token)
      .send({
        currentMileage: 1000,
        refuelAmount: 40,
        refuelDate: '2026-08-02T08:00:00.000Z',
        unitPrice: 8,
      })
      .expect(201);

    const fuelResponse = await request(app.getHttpServer())
      .get(`/api/v1/motos/${motoId}/fuel`)
      .set('x-ma-token', account.token)
      .expect(200);
    const fuel = fuelResponse.body as FuelListResponse;
    expect(fuel.fuelList).toHaveLength(1);
    expect(fuel.fuelList[0]).toEqual(
      expect.objectContaining({
        currentMileage: 1000,
        fuelCount: 5,
        motoId,
        refuelAmount: 40,
        unitPrice: 8,
      }),
    );
  });

  afterAll(async () => {
    await app?.close();
  });
});
