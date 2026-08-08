import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { CreateAccountTokenDto } from '../dto/create-account-token.dto';
import { AccountService } from '../services';

@Controller('account')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Post('token')
  @HttpCode(HttpStatus.OK)
  createToken(@Body() dto: CreateAccountTokenDto) {
    return this.accountService.createToken(dto);
  }
}
