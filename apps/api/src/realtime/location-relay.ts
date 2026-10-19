import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type Redis from 'ioredis';
import { RedisService } from '../infra/redis/redis.service';
import { LocationIngestService, LocationMessage } from '../location/location-ingest.service';
import { RealtimeGateway } from './realtime.gateway';

/**
 * §4.2 fan-out: every API instance PSUBSCRIBEs to the location channels
 * and pushes `location:update` to its own sockets in `errand:{id}` and
 * `admins`. This is plain Redis pub/sub, not the Socket.IO Redis adapter
 * (row 98: not approved; the API stays single-instance).
 */
@Injectable()
export class LocationRelay implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LocationRelay.name);
  private subscriber: Redis | null = null;

  constructor(
    private readonly redis: RedisService,
    private readonly ingest: LocationIngestService,
    private readonly gateway: RealtimeGateway,
  ) {}

  async onModuleInit(): Promise<void> {
    const sub = this.redis.createSubscriber();
    this.subscriber = sub;
    sub.on('pmessage', (_pattern: string, _channel: string, message: string) => this.relay(message));
    try {
      await sub.psubscribe(this.ingest.channelPattern());
    } catch (err) {
      this.logger.error(`Location fan-out not subscribed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    const sub = this.subscriber;
    this.subscriber = null;
    if (sub) {
      try {
        await sub.quit();
      } catch {
        sub.disconnect();
      }
    }
  }

  /** One published ping -> `location:update`. Malformed messages are dropped. */
  relay(message: string): void {
    let m: LocationMessage;
    try {
      m = JSON.parse(message) as LocationMessage;
    } catch {
      return;
    }
    if (typeof m?.errandId !== 'string' || typeof m.lat !== 'number' || typeof m.lng !== 'number') {
      return;
    }
    this.gateway.emitLocationUpdate({
      errandId: m.errandId,
      lat: m.lat,
      lng: m.lng,
      // ETA needs Distance Matrix (§5), not wired yet.
      eta: null,
      accuracy: m.accuracy ?? null,
      ts: m.ts,
    });
  }
}
