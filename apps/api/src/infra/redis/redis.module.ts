import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT, RedisService } from './redis.service';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis => {
        const client = new Redis({
          host: config.get<string>('redis.host', 'localhost'),
          port: config.get<number>('redis.port', 6379),
          // Row 224: applied by ioredis to every key, EVAL KEYS included.
          // BullMQ has its own connection and prefix (queue.module.ts).
          keyPrefix: config.get<string>('redis.keyPrefix', '') || undefined,
          maxRetriesPerRequest: 3,
          lazyConnect: false,
        });
        client.on('error', (err) => {
          // eslint-disable-next-line no-console
          console.error('Redis connection error:', err.message);
        });
        return client;
      },
    },
    RedisService,
  ],
  exports: [RedisService],
})
export class RedisModule {}