import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { MotoStatus } from '../constants';
import { FuelRecordEntity, MotoEntity } from '../database';
import { CreateFuelRecordDto } from '../dto/create-fuel-record.dto';
import type {
  FuelListResponse,
  FuelRecordResponse,
  FuelStatisticsResponse,
} from './service.types';

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
    const fuelCount = dto.refuelAmount / dto.unitPrice;

    await this.fuelRecords.insert({
      currentMileage: dto.currentMileage.toFixed(1),
      fuelCount: fuelCount.toFixed(4),
      motoId,
      refuelAmount: dto.refuelAmount.toFixed(2),
      refuelDate: new Date(dto.refuelDate),
      unitPrice: dto.unitPrice.toFixed(4),
    });
  }

  async findByMoto(ownerId: number, motoId: number): Promise<FuelListResponse> {
    await this.assertOwnedMoto(ownerId, motoId);
    const fuelRecords = await this.fuelRecords.find({
      order: { id: 'DESC' },
      where: { motoId },
    });

    return {
      fuelList: fuelRecords.map((record) => this.toResponse(record)),
      statisticsData: await this.getStatistics(motoId, fuelRecords[0]),
    };
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
      throw new NotFoundException('车辆不存在。');
    }
  }

  private async getStatistics(
    motoId: number,
    lastFuel?: FuelRecordEntity,
  ): Promise<FuelStatisticsResponse> {
    if (!lastFuel) {
      return { avgFuel: 0, avgPrice: 0, totalAmount: 0, totalMileage: 0 };
    }

    // Keep this aggregate in PostgreSQL. Repository.sum only accepts entity
    // properties typed as number, while PostgreSQL numeric values are strings.
    const result = await this.fuelRecords
      .createQueryBuilder('fuel')
      .select('SUM(fuel.refuelAmount)', 'totalAmount')
      .addSelect('SUM(fuel.fuelCount)', 'totalFuel')
      .where({ motoId, id: LessThan(lastFuel.id) })
      .getRawOne<{ totalAmount: string | null; totalFuel: string | null }>();

    const totalAmount = Number(result?.totalAmount ?? 0);
    const totalFuel = Number(result?.totalFuel ?? 0);
    const totalMileage = Number(lastFuel.currentMileage);
    return {
      avgFuel:
        totalMileage > 0
          ? Number(((totalFuel / totalMileage) * 100).toFixed(2))
          : 0,
      avgPrice:
        totalMileage > 0 ? Number((totalAmount / totalMileage).toFixed(2)) : 0,
      totalAmount,
      totalMileage,
    };
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
