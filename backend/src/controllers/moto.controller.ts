import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { type AuthenticatedUser, CurrentUser, TokenAuthGuard } from '../common';
import { CreateMotoDto } from '../dto/create-moto.dto';
import { MotoService } from '../services';

@Controller('motos')
@UseGuards(TokenAuthGuard)
export class MotoController {
  constructor(private readonly motoService: MotoService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.motoService.findByOwner(user.id);
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
      throw new BadRequestException('请上传正确的车辆图片。');
    }
    return this.motoService.create(user.id, dto, file);
  }
}
