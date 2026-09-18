import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Injectable()
export class RedisService {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  /** Set a key with a TTL in seconds. */
  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }

  /**
   * Increment a counter and set its TTL on first use. Used for
   * Redis-backed rate limiting.
   */
  async incrementWithTtl(key: string, ttlSeconds: number): Promise<number> {
    const value = await this.client.incr(key);
    if (value === 1) {
      await this.client.expire(key, ttlSeconds);
    }
    return value;
  }

  /** Atomically fetch and delete a key (single-use semantics). */
  async getAndDelete(key: string): Promise<string | null> {
    const value = await this.client.get(key);
    if (value !== null) {
      await this.client.del(key);
    }
    return value;
  }
}