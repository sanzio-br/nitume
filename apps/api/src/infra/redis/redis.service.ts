import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

const SET_IF_NOT_OLDER_SCRIPT = `
local cur = redis.call('GET', KEYS[1])
if cur then
  local ok, obj = pcall(cjson.decode, cur)
  if ok and type(obj) == 'table' and type(obj.v) == 'number' and obj.v > tonumber(ARGV[2]) then
    return 0
  end
end
redis.call('SET', KEYS[1], ARGV[1], 'EX', tonumber(ARGV[3]))
return 1
`;

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

  /**
   * Deletes every key matching a glob `pattern` (SCAN, never KEYS, so Redis is
   * not blocked) and returns how many were removed. The pattern is relative to
   * the configured key prefix, like every other key here: ioredis does not
   * prefix SCAN patterns or strip returned names, so both are done here.
   * Not atomic: a key created during the scan may survive.
   */
  async deleteMatching(pattern: string, count = 200): Promise<number> {
    const prefix = this.client.options.keyPrefix ?? '';
    let cursor = '0';
    let deleted = 0;
    do {
      const [next, keys] = await this.client.scan(cursor, 'MATCH', `${escapeGlob(prefix)}${pattern}`, 'COUNT', count);
      cursor = next;
      if (keys.length > 0) {
        deleted += await this.client.del(...keys.map((k) => k.slice(prefix.length)));
      }
    } while (cursor !== '0');
    return deleted;
  }

  /**
   * SET with a TTL unless the stored value is a JSON object whose numeric `v`
   * is greater than `version` (atomic, Lua). Lets writers that commit in
   * order but reach Redis out of order keep the newest value; a missing,
   * unversioned or malformed entry is overwritten. True when written.
   */
  async setIfNotOlder(key: string, value: string, version: number, ttlSeconds: number): Promise<boolean> {
    const written = await this.client.eval(SET_IF_NOT_OLDER_SCRIPT, 1, key, value, version, ttlSeconds);
    return written === 1;
  }

  /** Runs a Lua script atomically (EVAL). */
  async evalScript(script: string, keys: string[], args: (string | number)[]): Promise<unknown> {
    return this.client.eval(script, keys.length, ...keys, ...args);
  }

  /**
   * HGETALL for several hashes in one round trip (pipeline), in `keys`
   * order; a missing key gives `{}`. Throws when any command failed.
   */
  async hgetallMany(keys: string[]): Promise<Record<string, string>[]> {
    if (keys.length === 0) {
      return [];
    }
    const pipeline = this.client.pipeline();
    for (const key of keys) {
      pipeline.hgetall(key);
    }
    const replies = (await pipeline.exec()) ?? [];
    return keys.map((_key, i) => {
      const [err, value] = replies[i] ?? [new Error('no reply'), null];
      if (err) {
        throw err;
      }
      return (value as Record<string, string> | null) ?? {};
    });
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

/** Escapes Redis glob metacharacters so `value` matches only itself. */
export const escapeGlob = (value: string): string => value.replace(/[*?[\]\\]/g, (c) => `\\${c}`);
