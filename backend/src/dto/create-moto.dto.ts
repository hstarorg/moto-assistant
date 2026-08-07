import { IsDateString, IsNotEmpty, IsString } from 'class-validator';

export class CreateMotoDto {
  @IsString()
  @IsNotEmpty()
  motoName!: string;

  @IsDateString()
  motoBuyDate!: string;

  @IsString()
  @IsNotEmpty()
  motoLicensePlate!: string;
}
