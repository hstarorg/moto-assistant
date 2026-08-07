import { Controller } from '@nestjs/common';
import { FuelService } from '../services/fuel.service';

@Controller('motos/:motoId/fuel')
export class FuelController {
  constructor(private readonly fuelService: FuelService) {}
}
