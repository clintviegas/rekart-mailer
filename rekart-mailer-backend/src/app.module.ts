import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import {
  appConfig,
  dbConfig,
  emailConfig,
  jwtConfig,
  redisConfig,
  securityConfig,
} from './config/app.config';
import { envValidationSchema } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './providers/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { WorkspaceModule } from './modules/workspace/workspace.module';
import { SellModule } from './modules/sell/sell.module';
import { RepairModule } from './modules/repair/repair.module';
import { RentModule } from './modules/rent/rent.module';
import { RecycleModule } from './modules/recycle/recycle.module';
import { QueueModule } from './queue/queue.module';
import { HealthModule } from './modules/health/health.module';
import { ScheduleModule } from '@nestjs/schedule';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false, allowUnknown: true },
      load: [appConfig, dbConfig, emailConfig, jwtConfig, redisConfig, securityConfig],
    }),
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        throttlers: [
          {
            // Default: 100 req / 60s for authenticated API endpoints
            name:  'default',
            ttl:   parseInt(process.env.THROTTLE_TTL   ?? '60',  10) * 1000,
            limit: parseInt(process.env.THROTTLE_LIMIT ?? '100', 10),
          },
          {
            // Strict: 20 req / 60s for public customer action URLs (accept/decline/track)
            name:  'public',
            ttl:   60_000,
            limit: 20,
          },
        ],
      }),
    }),
    DatabaseModule,
    RedisModule,
    AuthModule,
    UsersModule,
    WorkspaceModule,
    QueueModule,
    SellModule,
    RepairModule,
    RentModule,
    RecycleModule,
    HealthModule,
    ScheduleModule.forRoot(),
  ],
  providers: [
    { provide: APP_FILTER,       useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR,  useClass: ResponseInterceptor },
    { provide: APP_INTERCEPTOR,  useClass: LoggingInterceptor },
    // Rate limiting applied globally; public routes use the "public" throttler
    { provide: APP_GUARD,        useClass: ThrottlerGuard },
    { provide: APP_GUARD,        useClass: JwtAuthGuard },
    { provide: APP_GUARD,        useClass: RolesGuard },
  ],
})
export class AppModule {}
