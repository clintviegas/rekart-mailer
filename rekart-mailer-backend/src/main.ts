import * as dns from 'dns';
import * as path from 'path';
// System DNS cannot resolve MongoDB Atlas SRV records — use Google/Cloudflare DNS.
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

// Prevent Redis / ioredis connection errors from crashing the process when
// Redis is temporarily unavailable. All real app errors still propagate.
process.on('unhandledRejection', (reason: unknown) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  if (msg.includes('ECONNREFUSED') && msg.includes('6379')) return; // Redis retry — safe to ignore
  console.error('[Process] Unhandled rejection:', msg);
});

import { NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const compression = require('compression') as (opts?: Record<string, unknown>) => import('express').RequestHandler;
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  // Serve uploaded files (logos, attachments) as static assets
  app.useStaticAssets(path.join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
  });

  // Serve brand mascot illustrations and other static assets
  app.useStaticAssets(path.join(process.cwd(), 'public'), {
    prefix: '/public',
  });

  const config = app.get(ConfigService);
  const port = config.get<number>('app.port') ?? 8000;
  const apiPrefix = config.get<string>('app.apiPrefix') ?? 'api/v1';
  const frontendUrl = config.get<string>('app.frontendUrl') ?? 'http://localhost:3000';
  const isDev = config.get<boolean>('app.isDev') ?? true;

  // Gzip/Brotli compression — reduces large JSON payloads by 60–80%
  app.use(compression({ threshold: 1024 }));

  app.use(
    helmet({
      contentSecurityPolicy: isDev ? false : undefined,
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.enableCors({
    origin: [frontendUrl, 'http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  app.setGlobalPrefix(apiPrefix);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  await app.listen(port);

  console.log(
    `\n🚀  Rekart Mailer API running on: http://localhost:${port}/${apiPrefix}`,
  );
  console.log(`   Environment: ${config.get<string>('app.nodeEnv')}\n`);
}

bootstrap();
