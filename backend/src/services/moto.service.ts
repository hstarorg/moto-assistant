import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MotoEntity } from '../database';

@Injectable()
export class MotoService {
  constructor(
    @InjectRepository(MotoEntity)
    private readonly motos: Repository<MotoEntity>,
  ) {}
}
