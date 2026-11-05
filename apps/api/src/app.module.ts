import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from './modules/auth';
import { DatabaseModule } from './modules/database';
import { ServeStaticModule } from '@nestjs/serve-static';
import { getUploadsPath } from './shared/config';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthGuard, RolesGuard } from './modules/auth/guards';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { MailerModule } from '@nestjs-modules/mailer';
import { CqrsModule } from '@nestjs/cqrs';
import { RolesModule } from './modules/roles';
import { UsersModule } from './modules/users';
import { StatsModule } from './modules/stats';
import { CacheManagerOptions, CacheModule } from '@nestjs/cache-manager';
import { createKeyv } from '@keyv/redis';
import { Keyv } from 'keyv';
import { KeyvCacheableMemory } from 'cacheable';
import { HealthModule } from './modules/health';
import { ApiExceptionFilter } from './shared/filters';
import { ApiResponseInterceptor } from './shared/interceptors';

@Module({
  imports: [
    CqrsModule.forRoot(),
    ConfigModule.forRoot({
      envFilePath: '../../.env',
      isGlobal: true
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60000, limit: 50 }]
    }),
    CacheModule.registerAsync({
      inject: [ConfigService],
      isGlobal: true,
      useFactory: async (configService: ConfigService) => ({
        ttl: 60000,
        stores: [
          new Keyv({
            store: new KeyvCacheableMemory({ ttl: 60000, lruSize: 5000 })
          }),
          createKeyv(configService.get('REDIS_URL'))
        ] as unknown as CacheManagerOptions['stores']
      })
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport: {
          target: 'pino-pretty',
          options: {
            singleLine: true,
            colorize: true
          }
        }
      }
    }),
    ServeStaticModule.forRoot({
      rootPath: getUploadsPath(),
      serveRoot: '/uploads'
    }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        global: true,
        secret: configService.getOrThrow('JWT_SECRET'),
        signOptions: { expiresIn: '1d' }
      })
    }),
    MailerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        transport: {
          host: config.get('MAIL_HOST'),
          port: +config.get('MAIL_PORT'),
          auth: {
            user: config.get('MAIL_USERNAME'),
            pass: config.get('MAIL_PASSWORD')
          }
        },
        defaults: {
          from:
            config.get('MAIL_FROM') ||
            `unslop-docs Support <${config.get('MAIL_USERNAME') || 'support@unslop-docs.local'}>`
        }
      })
    }),
    HealthModule,
    DatabaseModule,
    AuthModule,
    UsersModule,
    RolesModule,
    StatsModule
  ],
  providers: [
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ApiResponseInterceptor },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard }
  ]
})
export class AppModule {}
