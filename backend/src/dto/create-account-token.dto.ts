import { IsNotEmpty, IsString } from 'class-validator';

export class CreateAccountTokenDto {
  @IsString()
  @IsNotEmpty()
  code!: string;
}
