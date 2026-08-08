import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MotoStatus } from '../constants';
import { MotoEntity } from '../database';
import { CreateMotoDto } from '../dto/create-moto.dto';
import type { MotoResponse } from './service.types';
import { ThirdPartyService } from './third-party.service';

@Injectable()
export class MotoService {
  constructor(
    @InjectRepository(MotoEntity)
    private readonly motos: Repository<MotoEntity>,
    private readonly thirdParty: ThirdPartyService,
  ) {}

  async create(
    ownerId: number,
    dto: CreateMotoDto,
    file: Express.Multer.File,
  ): Promise<void> {
    const motoPhotoUrl = await this.thirdParty.uploadImage(file);
    await this.motos.insert({
      motoBuyDate: dto.motoBuyDate,
      motoLicensePlate: dto.motoLicensePlate,
      motoName: dto.motoName,
      motoPhotoUrl,
      ownerId,
      status: MotoStatus.ACTIVE,
    });
  }

  async findByOwner(ownerId: number): Promise<MotoResponse[]> {
    const motos = await this.motos.find({
      order: { updatedAt: 'DESC' },
      where: { ownerId, status: MotoStatus.ACTIVE },
    });
    return motos.map((moto) => this.toResponse(moto));
  }

  private toResponse(moto: MotoEntity): MotoResponse {
    return {
      createdAt: moto.createdAt.toISOString(),
      id: moto.id,
      motoBuyDate: moto.motoBuyDate,
      motoLicensePlate: moto.motoLicensePlate,
      motoName: moto.motoName,
      motoPhotoUrl: moto.motoPhotoUrl,
      ownerId: moto.ownerId,
      status: moto.status,
      updatedAt: moto.updatedAt.toISOString(),
    };
  }
}
