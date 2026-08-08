import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateMotoDto {
  @IsString()
  @IsNotEmpty()
  motoName!: string;

  @IsDateString()
  motoBuyDate!: string;

  @IsString()
  @IsNotEmpty()
  motoLicensePlate!: string;

  // Kept optional so clients may show a local preview path in multipart data.
  // The server ignores it and stores the URL returned by the image service.
  @IsOptional()
  @IsString()
  motoPhotoUrl?: string;
}
