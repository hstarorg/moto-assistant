import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

interface HttpExceptionBody {
  code?: unknown;
  message?: string | string[];
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status: HttpStatus =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (!(exception instanceof HttpException)) {
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const error = this.getMessage(exception, status);
    const code = this.getCode(exception);
    response.status(status).json(code ? { code, error } : { error });
  }

  private getCode(exception: unknown): string | undefined {
    if (!(exception instanceof HttpException)) {
      return undefined;
    }

    const body = exception.getResponse();
    if (typeof body === 'string') {
      return undefined;
    }
    const code = (body as HttpExceptionBody).code;
    return typeof code === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/u.test(code)
      ? code
      : undefined;
  }

  private getMessage(exception: unknown, status: HttpStatus): string {
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      if (typeof body === 'string') {
        return body;
      }

      const message = (body as HttpExceptionBody).message;
      if (typeof message === 'string' && /[\u4e00-\u9fff]/u.test(message)) {
        return message;
      }
    }

    if (status === HttpStatus.BAD_REQUEST) {
      return '请求参数不正确';
    }
    if (status === HttpStatus.NOT_FOUND) {
      return '请求的资源不存在';
    }
    return '服务器内部错误';
  }
}
