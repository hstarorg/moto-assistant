import { AccountService } from './account.service';
import { FuelService } from './fuel.service';
import { MotoService } from './moto.service';
import { TipService } from './tip.service';
import { ThirdPartyService } from './third-party.service';
import { WechatMessageService } from './wechat-message.service';
import { WechatVirtualPaymentService } from './wechat-virtual-payment.service';

export {
  AccountService,
  FuelService,
  MotoService,
  ThirdPartyService,
  TipService,
  WechatMessageService,
  WechatVirtualPaymentService,
};
export type {
  AccountTokenResponse,
  CreateTipOrderResponse,
  FuelListResponse,
  FuelRecordResponse,
  FuelStatisticsResponse,
  MotoResponse,
  TipOrderResponse,
} from './service.types';

export const ALL_SERVICES = [
  AccountService,
  MotoService,
  FuelService,
  ThirdPartyService,
  TipService,
  WechatMessageService,
  WechatVirtualPaymentService,
];
