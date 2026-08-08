import { Type } from 'class-transformer';
import { IsDateString, IsNumber, Min } from 'class-validator';

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
}
