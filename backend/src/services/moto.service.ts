import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LRUCache } from 'lru-cache';
import { Repository } from 'typeorm';
import { MotoStatus } from '../constants';
import { MotoEntity } from '../database';
import { CreateMotoDto } from '../dto/create-moto.dto';
import type { MotoResponse } from './service.types';
import { ThirdPartyService } from './third-party.service';

const IMAGE_URL_CACHE_MAX_ENTRIES = 500;
const IMAGE_URL_EXPIRES_IN_SECONDS = 60 * 60;
const IMAGE_URL_CACHE_TTL_MS = (IMAGE_URL_EXPIRES_IN_SECONDS - 15 * 60) * 1000;

@Injectable()
export class MotoService {
  private readonly logger = new Logger(MotoService.name);
  private readonly imageUrls = new LRUCache<string, Promise<string>>({
    max: IMAGE_URL_CACHE_MAX_ENTRIES,
    ttl: IMAGE_URL_CACHE_TTL_MS,
  });

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
    const motoPhotoKey = await this.thirdParty.uploadImage(file);
    await this.motos.insert({
      motoBuyDate: dto.motoBuyDate,
      motoLicensePlate: dto.motoLicensePlate,
      motoName: dto.motoName,
      motoPhotoUrl: motoPhotoKey,
      ownerId,
      status: MotoStatus.ACTIVE,
    });
  }

  async findByOwner(ownerId: number): Promise<MotoResponse[]> {
    const motos = await this.motos.find({
      order: { updatedAt: 'DESC' },
      where: { ownerId, status: MotoStatus.ACTIVE },
    });
    return Promise.all(motos.map((moto) => this.toResponse(moto)));
  }

  private async toResponse(moto: MotoEntity): Promise<MotoResponse> {
    return {
      createdAt: moto.createdAt.toISOString(),
      id: moto.id,
      motoBuyDate: moto.motoBuyDate,
      motoLicensePlate: moto.motoLicensePlate,
      motoName: moto.motoName,
      motoPhotoUrl: await this.getCachedImageUrl(moto.motoPhotoUrl),
      ownerId: moto.ownerId,
      status: moto.status,
      updatedAt: moto.updatedAt.toISOString(),
    };
  }

  private getCachedImageUrl(storedValue: string): Promise<string> {
    const cachedUrl = this.imageUrls.get(storedValue);
    if (cachedUrl) {
      return cachedUrl;
    }

    const imageUrl = this.thirdParty
      .getImageUrl(storedValue, IMAGE_URL_EXPIRES_IN_SECONDS)
      .catch(() => {
        this.imageUrls.delete(storedValue);
        this.logger.warn('生成车辆图片访问地址失败');
        return '';
      });
    this.imageUrls.set(storedValue, imageUrl);
    return imageUrl;
  }
}
