import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Shared BullMQ connection on the existing Redis (rows 26, 50). */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('redis.host', 'localhost'),
          port: config.get<number>('redis.port', 6379),
        },
        prefix: config.get<string>('queue.prefix', 'nitume'),
        defaultJobOptions: {
          attempts: config.get<number>('queue.attempts', 5),
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: 1_000,
          removeOnFail: 5_000,
        },
      }),
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
