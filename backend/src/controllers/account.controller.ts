import { Controller } from '@nestjs/common';
import { AccountService } from '../services/account.service';

@Controller('account')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}
}
