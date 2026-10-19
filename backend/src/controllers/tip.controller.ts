import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { type AuthenticatedUser, CurrentUser, TokenAuthGuard } from '../common';
import { CreateTipOrderDto } from '../dto/tip.dto';
import { TipService } from '../services';

@Controller('tips/orders')
@UseGuards(TokenAuthGuard)
export class TipController {
  constructor(private readonly tipService: TipService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTipOrderDto,
  ) {
    return this.tipService.createOrder(user.id, dto);
  }

  @Get(':orderNo')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderNo') orderNo: string,
  ) {
    return this.tipService.findOrder(user.id, orderNo);
  }
}
