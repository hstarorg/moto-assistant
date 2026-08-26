import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Equal,
  type FindOptionsWhere,
  LessThan,
  LessThanOrEqual,
  MoreThan,
  Not,
  Repository,
} from 'typeorm';
import { MotoStatus } from '../constants';
import { FuelRecordEntity, MotoEntity } from '../database';
import {
  CreateFuelRecordDto,
  FuelListQueryDto,
  UpdateFuelRecordDto,
} from '../dto/fuel-record.dto';
import type {
  FuelListResponse,
  FuelRecordResponse,
  FuelStatisticsResponse,
} from './service.types';

interface FuelPageCursor {
  id: number;
  refuelDate: Date;
}

interface FuelStatisticsSummary {
  statisticsData: FuelStatisticsResponse;
  totalCount: number;
}

@Injectable()
export class FuelService {
  constructor(
    @InjectRepository(FuelRecordEntity)
    private readonly fuelRecords: Repository<FuelRecordEntity>,
    @InjectRepository(MotoEntity)
    private readonly motos: Repository<MotoEntity>,
  ) {}

  async create(
    ownerId: number,
    motoId: number,
    dto: CreateFuelRecordDto,
  ): Promise<void> {
    await this.assertOwnedMoto(ownerId, motoId);
    const refuelDate = new Date(dto.refuelDate);
    await this.assertMileageOrder(
      motoId,
      refuelDate,
      dto.currentMileage,
      dto.confirmMileageAnomaly,
    );
    const fuelCount = dto.refuelAmount / dto.unitPrice;

    await this.fuelRecords.insert({
      currentMileage: dto.currentMileage.toFixed(1),
      fuelCount: fuelCount.toFixed(4),
      motoId,
      refuelAmount: dto.refuelAmount.toFixed(2),
      refuelDate,
      unitPrice: dto.unitPrice.toFixed(4),
    });
  }

  async findByMoto(
    ownerId: number,
    motoId: number,
    query: FuelListQueryDto,
  ): Promise<FuelListResponse> {
    await this.assertOwnedMoto(ownerId, motoId);
    const cursor = query.cursor ? this.decodeCursor(query.cursor) : undefined;
    const where: FindOptionsWhere<FuelRecordEntity>[] = cursor
      ? [
          { motoId, refuelDate: LessThan(cursor.refuelDate) },
          {
            id: LessThan(cursor.id),
            motoId,
            refuelDate: Equal(cursor.refuelDate),
          },
        ]
      : [{ motoId }];
    const [fuelRecords, summary] = await Promise.all([
      this.fuelRecords.find({
        order: { refuelDate: 'DESC', id: 'DESC' },
        take: query.limit + 1,
        where,
      }),
      this.getStatistics(motoId),
    ]);
    const hasMore = fuelRecords.length > query.limit;
    const pageRecords = hasMore
      ? fuelRecords.slice(0, query.limit)
      : fuelRecords;
    const lastRecord = pageRecords.at(-1);

    return {
      fuelList: pageRecords.map((record) => this.toResponse(record)),
      nextCursor: hasMore && lastRecord ? this.encodeCursor(lastRecord) : null,
      statisticsData: summary.statisticsData,
      totalCount: summary.totalCount,
    };
  }

  async update(
    ownerId: number,
    motoId: number,
    fuelId: number,
    dto: UpdateFuelRecordDto,
  ): Promise<FuelRecordResponse> {
    await this.assertOwnedMoto(ownerId, motoId);
    const fuelRecord = await this.fuelRecords.findOneBy({
      id: fuelId,
      motoId,
    });
    if (!fuelRecord) {
      throw new NotFoundException('加油记录不存在');
    }

    const refuelDate = new Date(dto.refuelDate);
    await this.assertMileageOrder(
      motoId,
      refuelDate,
      dto.currentMileage,
      dto.confirmMileageAnomaly,
      fuelId,
    );
    const fuelCount = dto.refuelAmount / dto.unitPrice;
    fuelRecord.currentMileage = dto.currentMileage.toFixed(1);
    fuelRecord.fuelCount = fuelCount.toFixed(4);
    fuelRecord.refuelAmount = dto.refuelAmount.toFixed(2);
    fuelRecord.refuelDate = refuelDate;
    fuelRecord.unitPrice = dto.unitPrice.toFixed(4);

    return this.toResponse(await this.fuelRecords.save(fuelRecord));
  }

  async remove(ownerId: number, motoId: number, fuelId: number): Promise<void> {
    await this.assertOwnedMoto(ownerId, motoId);
    const fuelRecord = await this.fuelRecords.findOneBy({
      id: fuelId,
      motoId,
    });
    if (!fuelRecord) {
      throw new NotFoundException('加油记录不存在');
    }

    await this.fuelRecords.softRemove(fuelRecord);
  }

  private async assertOwnedMoto(
    ownerId: number,
    motoId: number,
  ): Promise<void> {
    const exists = await this.motos.existsBy({
      id: motoId,
      ownerId,
      status: MotoStatus.ACTIVE,
    });
    if (!exists) {
      throw new NotFoundException('车辆不存在');
    }
  }

  private async getStatistics(motoId: number): Promise<FuelStatisticsSummary> {
    const [latestFuel, earliestFuel, totalCount] = await Promise.all([
      this.fuelRecords.findOne({
        order: { refuelDate: 'DESC', id: 'DESC' },
        where: { motoId },
      }),
      this.fuelRecords.findOne({
        order: { refuelDate: 'ASC', id: 'ASC' },
        where: { motoId },
      }),
      this.fuelRecords.countBy({ motoId }),
    ]);
    if (!latestFuel || !earliestFuel) {
      return {
        statisticsData: {
          avgFuel: 0,
          avgPrice: 0,
          currentMileage: 0,
          totalAmount: 0,
          totalMileage: 0,
        },
        totalCount,
      };
    }

    // Keep this aggregate in PostgreSQL. Repository.sum only accepts entity
    // properties typed as number, while PostgreSQL numeric values are strings.
    const result = await this.fuelRecords
      .createQueryBuilder('fuel')
      .select('SUM(fuel.refuelAmount)', 'totalAmount')
      .addSelect('SUM(fuel.fuelCount)', 'totalFuel')
      .where({ motoId, id: Not(latestFuel.id) })
      .getRawOne<{ totalAmount: string | null; totalFuel: string | null }>();

    const totalAmount = Number(result?.totalAmount ?? 0);
    const totalFuel = Number(result?.totalFuel ?? 0);
    const currentMileage = Number(latestFuel.currentMileage);
    const totalMileage = Math.max(
      currentMileage - Number(earliestFuel.currentMileage),
      0,
    );
    return {
      statisticsData: {
        avgFuel:
          totalMileage > 0
            ? Number(((totalFuel / totalMileage) * 100).toFixed(2))
            : 0,
        avgPrice:
          totalMileage > 0
            ? Number((totalAmount / totalMileage).toFixed(2))
            : 0,
        currentMileage,
        totalAmount,
        totalMileage,
      },
      totalCount,
    };
  }

  private async assertMileageOrder(
    motoId: number,
    refuelDate: Date,
    currentMileage: number,
    confirmed = false,
    fuelId?: number,
  ): Promise<void> {
    if (confirmed) {
      return;
    }

    const [previous, next] = await this.findMileageNeighbors(
      motoId,
      refuelDate,
      fuelId,
    );
    const warnings: string[] = [];
    if (previous && currentMileage < Number(previous.currentMileage)) {
      warnings.push(`本次里程低于上一条 ${this.describeMileage(previous)}`);
    }
    if (next && currentMileage > Number(next.currentMileage)) {
      warnings.push(`本次里程高于下一条 ${this.describeMileage(next)}`);
    }

    if (warnings.length > 0) {
      throw new ConflictException({
        code: 'MILEAGE_ANOMALY',
        message: `${warnings.join('；')}。请检查加油日期或里程；如仪表已更换或重置，可以继续保存`,
      });
    }
  }

  private async findMileageNeighbors(
    motoId: number,
    refuelDate: Date,
    fuelId?: number,
  ): Promise<[FuelRecordEntity | null, FuelRecordEntity | null]> {
    let previousWhere: FindOptionsWhere<FuelRecordEntity>[];
    let nextWhere: FindOptionsWhere<FuelRecordEntity>[];

    if (fuelId === undefined) {
      previousWhere = [{ motoId, refuelDate: LessThanOrEqual(refuelDate) }];
      nextWhere = [{ motoId, refuelDate: MoreThan(refuelDate) }];
    } else {
      previousWhere = [
        {
          id: Not(fuelId),
          motoId,
          refuelDate: LessThan(refuelDate),
        },
        {
          id: LessThan(fuelId),
          motoId,
          refuelDate: Equal(refuelDate),
        },
      ];
      nextWhere = [
        {
          id: MoreThan(fuelId),
          motoId,
          refuelDate: Equal(refuelDate),
        },
        {
          id: Not(fuelId),
          motoId,
          refuelDate: MoreThan(refuelDate),
        },
      ];
    }

    return Promise.all([
      this.fuelRecords.findOne({
        order: { refuelDate: 'DESC', id: 'DESC' },
        where: previousWhere,
      }),
      this.fuelRecords.findOne({
        order: { refuelDate: 'ASC', id: 'ASC' },
        where: nextWhere,
      }),
    ]);
  }

  private describeMileage(record: FuelRecordEntity): string {
    return `${Number(record.currentMileage)} 公里（${record.refuelDate.toISOString().slice(0, 10)}）`;
  }

  private encodeCursor(record: FuelRecordEntity): string {
    return Buffer.from(
      JSON.stringify({
        id: record.id,
        refuelDate: record.refuelDate.toISOString(),
      }),
    ).toString('base64url');
  }

  private decodeCursor(value: string): FuelPageCursor {
    try {
      const parsed = JSON.parse(
        Buffer.from(value, 'base64url').toString('utf8'),
      ) as { id?: unknown; refuelDate?: unknown };
      if (
        !Number.isInteger(parsed.id) ||
        (parsed.id as number) <= 0 ||
        typeof parsed.refuelDate !== 'string'
      ) {
        throw new Error('invalid cursor payload');
      }

      const refuelDate = new Date(parsed.refuelDate);
      if (
        Number.isNaN(refuelDate.getTime()) ||
        refuelDate.toISOString() !== parsed.refuelDate
      ) {
        throw new Error('invalid cursor date');
      }
      return { id: parsed.id as number, refuelDate };
    } catch {
      throw new BadRequestException('分页游标无效');
    }
  }

  private toResponse(record: FuelRecordEntity): FuelRecordResponse {
    return {
      createdAt: record.createdAt.toISOString(),
      currentMileage: Number(record.currentMileage),
      fuelCount: Number(record.fuelCount),
      id: record.id,
      motoId: record.motoId,
      refuelAmount: Number(record.refuelAmount),
      refuelDate: record.refuelDate.toISOString(),
      unitPrice: Number(record.unitPrice),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
