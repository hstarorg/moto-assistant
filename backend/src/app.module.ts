import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TokenAuthGuard } from './common';
import { ALL_CONTROLLERS } from './controllers';
import { ALL_ENTITIES } from './database';
import { ALL_SERVICES } from './services';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.getOrThrow<string>('DATABASE_URL'),
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),
    TypeOrmModule.forFeature(ALL_ENTITIES),
  ],
  controllers: ALL_CONTROLLERS,
  providers: [...ALL_SERVICES, TokenAuthGuard],
})
export class AppModule {}
