import { BadRequestException, Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { text } from 'express';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(
    '/api/v1/wechat/messages',
    text({ limit: '256kb', type: ['application/xml', 'text/xml'] }),
  );
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      exceptionFactory: () => new BadRequestException('请求参数不正确'),
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  app.enableShutdownHooks();

  await app.listen(7410, '0.0.0.0');
  logger.log(`App is running at ${await app.getUrl()}`);
}
void bootstrap();
