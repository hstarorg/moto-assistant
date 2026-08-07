import { Controller } from '@nestjs/common';
import { MotoService } from '../services/moto.service';

@Controller('motos')
export class MotoController {
  constructor(private readonly motoService: MotoService) {}
}
