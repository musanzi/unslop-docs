import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import session from 'express-session';
import passport from 'passport';
import { Logger } from 'nestjs-pino';
import { RedisStore } from 'connect-redis';
import { createClient } from 'redis';
import { SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { createOpenApiDocument } from './shared/helpers/create-openapi-document';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.useLogger(app.get(Logger));
  app.enableCors({
    credentials: true,
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true
    })
  );

  const redisClient = createClient({
    url: process.env.REDIS_URL
  });
  redisClient.on('error', (error) => {
    console.error('Redis client error', error);
  });
  await redisClient.connect();

  app.use(
    session({
      store: new RedisStore({
        client: redisClient,
        prefix: 'sess:'
      }),
      saveUninitialized: false,
      secret: process.env.SESSION_SECRET,
      resave: false,
      cookie: {
        maxAge: +process.env.SESSION_MAX_AGE,
        sameSite: 'lax'
      }
    })
  );

  app.use(passport.initialize({}));
  app.use(passport.session());

  const document = createOpenApiDocument(app);

  SwaggerModule.setup('openapi', app, document, {
    ui: false,
    raw: ['json'],
    jsonDocumentUrl: 'openapi.json'
  });

  app.use(
    '/docs',
    apiReference({
      content: document
    })
  );

  await app.listen(process.env.API_PORT ?? 8000);
}

bootstrap();
