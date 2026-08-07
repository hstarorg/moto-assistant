import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FuelRecordEntity } from '../database';

@Injectable()
export class FuelService {
  constructor(
    @InjectRepository(FuelRecordEntity)
    private readonly fuelRecords: Repository<FuelRecordEntity>,
  ) {}
}
