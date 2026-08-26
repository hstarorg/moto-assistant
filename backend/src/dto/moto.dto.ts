import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { MotoStatus } from '../constants';

export class MotoListQueryDto {
  @IsOptional()
  @IsEnum(MotoStatus)
  status: MotoStatus = MotoStatus.ACTIVE;
}

export class CreateMotoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  motoName!: string;

  @IsDateString()
  motoBuyDate!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  motoLicensePlate!: string;

  // Kept optional so clients may show a local preview path in multipart data.
  // The server ignores it and stores the key returned by the image service.
  @IsOptional()
  @IsString()
  motoPhotoUrl?: string;
}

export class UpdateMotoDto extends CreateMotoDto {}
