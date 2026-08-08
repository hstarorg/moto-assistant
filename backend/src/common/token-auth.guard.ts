import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AccountService } from '../services';
import type { AuthenticatedRequest } from './current-user.decorator';

@Injectable()
export class TokenAuthGuard implements CanActivate {
  constructor(private readonly accountService: AccountService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const tokenHeader = request.headers['x-ma-token'];
    const token = Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader;
    const user = token
      ? await this.accountService.authenticateToken(token)
      : null;

    if (!user) {
      throw new UnauthorizedException('请先登录');
    }

    request.user = user;
    return true;
  }
}
