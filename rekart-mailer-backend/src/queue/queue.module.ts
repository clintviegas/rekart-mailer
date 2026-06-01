import { Global, Logger, Module } from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { REPAIR_EMAIL_QUEUE, RENT_EMAIL_QUEUE, RECYCLE_EMAIL_QUEUE, SELL_EMAIL_QUEUE } from './queue.constants';

export const SELL_EMAIL_QUEUE_TOKEN = 'SELL_EMAIL_QUEUE';
export const REPAIR_EMAIL_QUEUE_TOKEN = 'REPAIR_EMAIL_QUEUE';
export const RENT_EMAIL_QUEUE_TOKEN = 'RENT_EMAIL_QUEUE';
export const RECYCLE_EMAIL_QUEUE_TOKEN = 'RECYCLE_EMAIL_QUEUE';

export function isSellBullQueueEnabled(): boolean {
  return process.env.SELL_USE_BULL_QUEUE === 'true';
}

export function isRepairBullQueueEnabled(): boolean {
  return process.env.REPAIR_USE_BULL_QUEUE === 'true';
}

export function isRentBullQueueEnabled(): boolean {
  return process.env.RENT_USE_BULL_QUEUE === 'true';
}

export function isRecycleBullQueueEnabled(): boolean {
  return process.env.RECYCLE_USE_BULL_QUEUE === 'true';
}

function createRedisConnection(): Redis {
  const client = new Redis({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    retryStrategy: (times) => Math.min(times * 500, 10_000),
    enableOfflineQueue: false,
    lazyConnect: false,
  });

  client.on('error', (err: Error) =>
    console.warn('[Redis] Connection error (will retry):', err.message),
  );

  return client;
}

function createBullQueue(queueName: string, envFlag: string): Queue | null {
  if (process.env[envFlag] !== 'true') {
    new Logger('QueueModule').log(
      `BullMQ ${queueName} queue skipped (set ${envFlag}=true to enable).`,
    );
    return null;
  }

  const connection = createRedisConnection();
  const queue = new Queue(queueName, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 500 },
    },
  });

  queue.on('error', (err) =>
    console.warn('[BullMQ] Queue error (will retry):', err.message),
  );

  return queue;
}

@Global()
@Module({
  providers: [
    {
      provide: SELL_EMAIL_QUEUE_TOKEN,
      useFactory: () => createBullQueue(SELL_EMAIL_QUEUE, 'SELL_USE_BULL_QUEUE'),
    },
    {
      provide: REPAIR_EMAIL_QUEUE_TOKEN,
      useFactory: () => createBullQueue(REPAIR_EMAIL_QUEUE, 'REPAIR_USE_BULL_QUEUE'),
    },
    {
      provide: RENT_EMAIL_QUEUE_TOKEN,
      useFactory: () => createBullQueue(RENT_EMAIL_QUEUE, 'RENT_USE_BULL_QUEUE'),
    },
    {
      provide: RECYCLE_EMAIL_QUEUE_TOKEN,
      useFactory: () => createBullQueue(RECYCLE_EMAIL_QUEUE, 'RECYCLE_USE_BULL_QUEUE'),
    },
  ],
  exports: [SELL_EMAIL_QUEUE_TOKEN, REPAIR_EMAIL_QUEUE_TOKEN, RENT_EMAIL_QUEUE_TOKEN, RECYCLE_EMAIL_QUEUE_TOKEN],
})
export class QueueModule {}
