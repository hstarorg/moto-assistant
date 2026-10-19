import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { WechatMessageQueryDto } from '../dto/wechat-message.dto';
import { WechatMessageService } from '../services';

@Controller('wechat/messages')
export class WechatMessageController {
  constructor(private readonly wechatMessageService: WechatMessageService) {}

  @Get()
  @Header('Content-Type', 'text/plain; charset=utf-8')
  verify(@Query() query: WechatMessageQueryDto): string {
    return this.wechatMessageService.verifyUrl(query);
  }

  @Post()
  @Header('Content-Type', 'application/json; charset=utf-8')
  @HttpCode(HttpStatus.OK)
  receive(
    @Query() query: WechatMessageQueryDto,
    @Body() body: unknown,
  ): Promise<{ ErrCode: 0; ErrMsg: 'success' }> {
    return this.wechatMessageService.handlePush(query, body);
  }
}
