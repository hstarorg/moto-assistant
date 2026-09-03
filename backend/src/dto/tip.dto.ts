import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateTipOrderDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountYuan!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  loginCode!: string;

  @IsString()
  @Matches(/^[A-Za-z0-9-]{16,64}$/u)
  clientRequestId!: string;
}
