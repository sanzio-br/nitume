import { ThrottlerStorage } from '@nestjs/throttler';
import { RedisService } from '../redis/redis.service';

type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>;

/**
 * Fixed-window hit counter + block flag in one atomic script:
 * KEYS[1] = hits, KEYS[2] = block; ARGV = ttlMs, limit, blockMs.
 */
const SCRIPT = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
local blockTtl = redis.call('PTTL', KEYS[2])
if blockTtl <= 0 and hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  blockTtl = tonumber(ARGV[3])
end
return {hits, ttl, blockTtl}
`;

/**
 * @nestjs/throttler storage on the existing Redis connection (row 53), so
 * per-IP limits hold across API instances. Redis only holds counters, never
 * anything financial.
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(
    private readonly redis: RedisService,
    private readonly prefix = 'throttle',
  ) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const base = `${this.prefix}:${throttlerName}:${key}`;
    const [hits, ttlMs, blockMs] = (await this.redis.evalScript(
      SCRIPT,
      [`${base}:hits`, `${base}:block`],
      [Math.max(ttl, 1), limit, Math.max(blockDuration, 1)],
    )) as [number, number, number];
    return {
      totalHits: hits,
      timeToExpire: Math.max(Math.ceil(ttlMs / 1000), 0),
      isBlocked: blockMs > 0,
      timeToBlockExpire: Math.max(Math.ceil(blockMs / 1000), 0),
    };
  }
}
