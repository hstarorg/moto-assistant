import { AccountController } from './account.controller';
import { FuelController } from './fuel.controller';
import { HealthController } from './health.controller';
import { MotoController } from './moto.controller';
import { TipController } from './tip.controller';
import { WechatMessageController } from './wechat-message.controller';

export const ALL_CONTROLLERS = [
  HealthController,
  AccountController,
  MotoController,
  FuelController,
  TipController,
  WechatMessageController,
];
