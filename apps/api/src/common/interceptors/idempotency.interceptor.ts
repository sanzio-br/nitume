import {
  applyDecorators,
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  Logger,
  NestInterceptor,
  SetMetadata,
  UseInterceptors,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { Observable, from, of } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import { RedisService } from '../../infra/redis/redis.service';
import { ApiError } from '../api-error';
import { AuthContext } from '../decorators/auth.decorators';

/** How long a completed call is replayed for its key (same as payout requests). */
export const IDEMPOTENT_REPLAY_TTL_SECONDS = 24 * 60 * 60;
/** How long a key stays reserved while its first call runs. */
export const IDEMPOTENT_PENDING_TTL_SECONDS = 60;
export const IDEMPOTENCY_HEADER = 'idempotency-key';
const IDEMPOTENT_SCOPE = 'idempotentScope';
const MAX_KEY_LENGTH = 128;

interface Stored {
  fp: string;
  pending?: boolean;
  body?: unknown;
}

/**
 * RA-17 / A6: optional `Idempotency-Key` header (the client's offline-queue
 * action id, 1-128 characters). The first call runs; a replay with the same
 * key, user, route and body returns the first result (same status, header
 * `Idempotent-Replay: true`) and
 * writes nothing. Errors: 400 idempotency_key_invalid; 409
 * idempotency_key_reused (same key, different request); 409
 * idempotency_in_progress (the first call is still running, retry). A
 * failed call releases the key, so a retry runs again. Without Redis the
 * call runs unprotected (the state checks still refuse duplicates).
 */
export const Idempotent = (scope: string): MethodDecorator =>
  applyDecorators(SetMetadata(IDEMPOTENT_SCOPE, scope), UseInterceptors(IdempotencyInterceptor));

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & { user?: AuthContext }>();
    const res = http.getResponse<Response>();
    const header = req.headers[IDEMPOTENCY_HEADER];
    const raw = Array.isArray(header) ? header[0] : header;
    if (raw === undefined) {
      return next.handle();
    }
    const key = raw.trim();
    if (key.length === 0 || key.length > MAX_KEY_LENGTH) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'idempotency_key_invalid', `Idempotency-Key must be 1-${MAX_KEY_LENGTH} characters`);
    }
    const scope = this.reflector.get<string>(IDEMPOTENT_SCOPE, context.getHandler()) ?? 'default';
    const redisKey = `idem:${scope}:${req.user?.userId ?? 'anon'}:${key}`;
    const fp = createHash('sha256')
      .update(`${req.method} ${req.originalUrl ?? req.url}\n${JSON.stringify(req.body ?? null)}`)
      .digest('hex');

    let reserved = false;
    try {
      reserved = await this.redis.setIfAbsent(redisKey, JSON.stringify({ fp, pending: true } satisfies Stored), IDEMPOTENT_PENDING_TTL_SECONDS);
      if (!reserved) {
        const stored = parse(await this.redis.get(redisKey));
        if (stored) {
          if (stored.fp !== fp) {
            throw new ApiError(HttpStatus.CONFLICT, 'idempotency_key_reused', 'This Idempotency-Key was used for a different request');
          }
          if (stored.pending) {
            throw new ApiError(HttpStatus.CONFLICT, 'idempotency_in_progress', 'This request is still being processed. Try again shortly.');
          }
          res.setHeader('Idempotent-Replay', 'true');
          return of(stored.body);
        }
        // Expired between the two calls: run it now (unreserved).
      }
    } catch (err) {
      if (err instanceof ApiError) {
        throw err;
      }
      this.logger.warn(`Idempotency store unavailable: ${err instanceof Error ? err.message : String(err)}`);
      return next.handle();
    }

    return next.handle().pipe(
      mergeMap(async (body: unknown) => {
        if (reserved) {
          // The route's own status code applies to the replay too.
          const stored: Stored = { fp, body: JSON.parse(JSON.stringify(body ?? null)) as unknown };
          await this.redis
            .set(redisKey, JSON.stringify(stored), IDEMPOTENT_REPLAY_TTL_SECONDS)
            .catch((e: unknown) => this.logger.error(`Idempotency result not stored: ${e instanceof Error ? e.message : String(e)}`));
        }
        return body;
      }),
      catchError((err: unknown) =>
        from(
          (async () => {
            if (reserved) {
              await this.redis.del(redisKey).catch(() => undefined);
            }
            throw err;
          })(),
        ),
      ),
    );
  }
}

const parse = (raw: string | null): Stored | null => {
  if (!raw) {
    return null;
  }
  try {
    const v = JSON.parse(raw) as Stored;
    return typeof v?.fp === 'string' ? v : null;
  } catch {
    return null;
  }
};
