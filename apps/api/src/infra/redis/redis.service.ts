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

  /** SET NX with a TTL: true when this call created the key. */
  async setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    return (await this.client.set(key, value, 'EX', ttlSeconds, 'NX')) === 'OK';
  }

  /** SET NX with a TTL in milliseconds: true when this call created the key. */
  async setIfAbsentMs(key: string, value: string, ttlMs: number): Promise<boolean> {
    return (await this.client.set(key, value, 'PX', ttlMs, 'NX')) === 'OK';
  }

  /**
   * PUBLISH. Channels are not keys, so ioredis does not prefix them; callers
   * build names with `channel()` to keep the row-224 test isolation.
   */
  async publish(channel: string, message: string): Promise<number> {
    return this.client.publish(channel, message);
  }

  /** A channel name carrying the configured key prefix (row 224). */
  channel(name: string): string {
    return `${this.client.options.keyPrefix ?? ''}${name}`;
  }

  /**
   * A new connection for SUBSCRIBE/PSUBSCRIBE (a subscribed connection
   * cannot run other commands). The caller must `quit()` it.
   */
  createSubscriber(): Redis {
    return this.client.duplicate();
  }

  /** Runs a Lua script atomically (EVAL). */
  async evalScript(script: string, keys: string[], args: (string | number)[]): Promise<unknown> {
    return this.client.eval(script, keys.length, ...keys, ...args);
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