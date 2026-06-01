import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisProvider, REDIS_CLIENT } from './redis.provider';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [RedisProvider],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
