import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { type AuthenticatedUser, CurrentUser, TokenAuthGuard } from '../common';
import { CreateFuelRecordDto } from '../dto/create-fuel-record.dto';
import { FuelService } from '../services';

@Controller('motos/:motoId/fuel')
@UseGuards(TokenAuthGuard)
export class FuelController {
  constructor(private readonly fuelService: FuelService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Param('motoId', ParseIntPipe) motoId: number,
  ) {
    return this.fuelService.findByMoto(user.id, motoId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('motoId', ParseIntPipe) motoId: number,
    @Body() dto: CreateFuelRecordDto,
  ) {
    return this.fuelService.create(user.id, motoId, dto);
  }
}
