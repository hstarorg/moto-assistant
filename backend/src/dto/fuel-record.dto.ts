import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';

export class CreateFuelRecordDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  currentMileage!: number;

  @IsDateString()
  refuelDate!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  refuelAmount!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  unitPrice!: number;

  @IsOptional()
  @IsBoolean()
  confirmMileageAnomaly?: boolean;
}

export class UpdateFuelRecordDto extends CreateFuelRecordDto {}
