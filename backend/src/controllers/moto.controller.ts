import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { type AuthenticatedUser, CurrentUser, TokenAuthGuard } from '../common';
import {
  CreateMotoDto,
  MotoListQueryDto,
  UpdateMotoDto,
} from '../dto/moto.dto';
import { MotoService } from '../services';

@Controller('motos')
@UseGuards(TokenAuthGuard)
export class MotoController {
  constructor(private readonly motoService: MotoService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MotoListQueryDto,
  ) {
    return this.motoService.findByOwner(user.id, query.status);
  }

  @Get(':motoId')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('motoId', ParseIntPipe) motoId: number,
  ) {
    return this.motoService.findOne(user.id, motoId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10_000_000 } }),
  )
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMotoDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file || !file.mimetype.startsWith('image/')) {
      throw new BadRequestException('请上传正确的车辆图片');
    }
    return this.motoService.create(user.id, dto, file);
  }

  @Put(':motoId')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10_000_000 } }),
  )
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('motoId', ParseIntPipe) motoId: number,
    @Body() dto: UpdateMotoDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (file && !file.mimetype.startsWith('image/')) {
      throw new BadRequestException('请上传正确的车辆图片');
    }
    return this.motoService.update(user.id, motoId, dto, file);
  }

  @Patch(':motoId/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('motoId', ParseIntPipe) motoId: number,
  ) {
    return this.motoService.archive(user.id, motoId);
  }

  @Patch(':motoId/restore')
  @HttpCode(HttpStatus.NO_CONTENT)
  restore(
    @CurrentUser() user: AuthenticatedUser,
    @Param('motoId', ParseIntPipe) motoId: number,
  ) {
    return this.motoService.restore(user.id, motoId);
  }
}
