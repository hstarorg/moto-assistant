import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { TokenAuthGuard } from '../src/auth/token-auth.guard';
import { ApiExceptionFilter } from '../src/common/api-exception.filter';
import { AccountController } from '../src/controllers/account.controller';
import { FuelController } from '../src/controllers/fuel.controller';
import { MotoController } from '../src/controllers/moto.controller';
import { AccountService } from '../src/services/account.service';
import { FuelService } from '../src/services/fuel.service';
import { MotoService } from '../src/services/moto.service';

describe('API routes (e2e)', () => {
  let app: INestApplication<App>;
  let token: string;
  const createAccountToken = jest.fn();
  const createFuel = jest.fn();
  const createMoto = jest.fn();
  const findFuel = jest.fn();
  const findMotos = jest.fn();
  const getTokenSession = jest.fn();

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      controllers: [AccountController, MotoController, FuelController],
      providers: [
        TokenAuthGuard,
        {
          provide: AccountService,
          useValue: {
            authenticateToken: getTokenSession,
            createToken: createAccountToken,
          },
        },
        {
          provide: FuelService,
          useValue: { create: createFuel, findByMoto: findFuel },
        },
        {
          provide: MotoService,
          useValue: { create: createMoto, findByOwner: findMotos },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ApiExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        exceptionFactory: () =>
          new BadRequestException('请按照格式，填写正确的数据。'),
        forbidNonWhitelisted: true,
        transform: true,
        whitelist: true,
      }),
    );
    await app.init();
    token = 'valid-token';
  });

  beforeEach(() => {
    jest.clearAllMocks();
    getTokenSession.mockImplementation((value: string) =>
      Promise.resolve(value === token ? { id: 7 } : null),
    );
  });

  it('keeps the account token route public', async () => {
    createAccountToken.mockResolvedValue({ id: 7, token: 'new-token' });

    await request(app.getHttpServer())
      .post('/api/v1/account/token')
      .send({ code: 'code', encryptedData: 'encrypted', iv: 'iv' })
      .expect(200)
      .expect({ id: 7, token: 'new-token' });
  });

  it('protects vehicle routes with x-ma-token', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/motos')
      .expect(401)
      .expect({ error: '请先登录。' });
  });

  it('lists vehicles for the authenticated user', async () => {
    findMotos.mockResolvedValue([{ id: 11, status: 'active' }]);

    await request(app.getHttpServer())
      .get('/api/v1/motos')
      .set('x-ma-token', token)
      .expect(200)
      .expect([{ id: 11, status: 'active' }]);
    expect(findMotos).toHaveBeenCalledWith(7);
  });

  it('accepts a multipart vehicle request', async () => {
    createMoto.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .post('/api/v1/motos')
      .set('x-ma-token', token)
      .field('motoName', '测试车辆')
      .field('motoBuyDate', '2026-08-01')
      .field('motoLicensePlate', '川A12345')
      .field('motoPhotoUrl', 'wxfile://local-preview-path')
      .attach('file', Buffer.from('image'), {
        contentType: 'image/jpeg',
        filename: 'moto.jpg',
      })
      .expect(201);
    expect(createMoto).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        motoBuyDate: '2026-08-01',
        motoLicensePlate: '川A12345',
        motoName: '测试车辆',
      }),
      expect.objectContaining({ mimetype: 'image/jpeg' }),
    );
  });

  it('accepts and transforms fuel fields', async () => {
    createFuel.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .post('/api/v1/motos/11/fuel')
      .set('x-ma-token', token)
      .send({
        currentMileage: '100.5',
        refuelAmount: '50',
        refuelDate: '2026-08-02',
        unitPrice: '8',
      })
      .expect(201);
    expect(createFuel).toHaveBeenCalledWith(7, 11, {
      currentMileage: 100.5,
      refuelAmount: 50,
      refuelDate: '2026-08-02',
      unitPrice: 8,
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
