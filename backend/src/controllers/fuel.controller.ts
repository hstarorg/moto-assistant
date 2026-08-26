import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Put,
  UseGuards,
} from '@nestjs/common';
import { type AuthenticatedUser, CurrentUser, TokenAuthGuard } from '../common';
import {
  CreateFuelRecordDto,
  FuelListQueryDto,
  UpdateFuelRecordDto,
} from '../dto/fuel-record.dto';
import { FuelService } from '../services';

@Controller('motos/:motoId/fuel')
@UseGuards(TokenAuthGuard)
export class FuelController {
  constructor(private readonly fuelService: FuelService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Param('motoId', ParseIntPipe) motoId: number,
    @Query() query: FuelListQueryDto,
  ) {
    return this.fuelService.findByMoto(user.id, motoId, query);
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

  @Put(':fuelId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('motoId', ParseIntPipe) motoId: number,
    @Param('fuelId', ParseIntPipe) fuelId: number,
    @Body() dto: UpdateFuelRecordDto,
  ) {
    return this.fuelService.update(user.id, motoId, fuelId, dto);
  }

  @Delete(':fuelId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('motoId', ParseIntPipe) motoId: number,
    @Param('fuelId', ParseIntPipe) fuelId: number,
  ) {
    return this.fuelService.remove(user.id, motoId, fuelId);
  }
}
