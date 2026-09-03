import { IsOptional, IsString, MaxLength } from 'class-validator';

export class WechatMessageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  signature?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  msg_signature?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  timestamp?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  nonce?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  echostr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  encrypt_type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  openid?: string;
}
