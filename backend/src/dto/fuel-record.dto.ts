import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class FuelListQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}

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
