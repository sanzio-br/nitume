import { createHash } from 'node:crypto';
import { lastValueFrom, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { IdempotencyInterceptor } from './idempotency.interceptor';

const build = () => {
  const store = new Map<string, string>();
  const redis = {
    setIfAbsent: vi.fn((k: string, v: string) => {
      if (store.has(k)) return Promise.resolve(false);
      store.set(k, v);
      return Promise.resolve(true);
    }),
    get: vi.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
    set: vi.fn((k: string, v: string) => {
      store.set(k, v);
      return Promise.resolve();
    }),
    del: vi.fn((k: string) => {
      store.delete(k);
      return Promise.resolve();
    }),
  };
  const reflector = { get: vi.fn(() => 'errand-status') };
  const interceptor = new IdempotencyInterceptor(reflector as never, redis as never);
  const ctx = (key: string | undefined, body: unknown = { to: 'ARRIVED' }) => {
    const res = { setHeader: vi.fn() };
    return {
      res,
      context: {
        getHandler: () => () => undefined,
        switchToHttp: () => ({
          getRequest: () => ({
            headers: key === undefined ? {} : { 'idempotency-key': key },
            user: { userId: 'u-1' },
            method: 'PATCH',
            originalUrl: '/api/v1/errands/e-1/status',
            body,
          }),
          getResponse: () => res,
        }),
      } as never,
    };
  };
  return { interceptor, redis, store, ctx };
};

const run = async (i: IdempotencyInterceptor, context: never, handler: () => unknown) =>
  lastValueFrom(await i.intercept(context, { handle: () => of(handler()) } as never));

describe('IdempotencyInterceptor (RA-17, A6)', () => {
  it('passes through without a key', async () => {
    const { interceptor, redis, ctx } = build();
    await expect(run(interceptor, ctx(undefined).context, () => ({ ok: 1 }))).resolves.toEqual({ ok: 1 });
    expect(redis.setIfAbsent).not.toHaveBeenCalled();
  });

  it('runs once and replays the first result for the same key and body', async () => {
    const { interceptor, ctx, store } = build();
    const handler = vi.fn(() => ({ errand: { status: 'ARRIVED', at: new Date('2026-10-19T10:00:00Z') } }));
    await run(interceptor, ctx('act-1').context, handler);
    const replay = ctx('act-1');
    await expect(run(interceptor, replay.context, handler)).resolves.toEqual({
      errand: { status: 'ARRIVED', at: '2026-10-19T10:00:00.000Z' },
    });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(replay.res.setHeader).toHaveBeenCalledWith('Idempotent-Replay', 'true');
    expect([...store.keys()]).toEqual(['idem:errand-status:u-1:act-1']);
  });

  it('refuses the same key with a different body, and while the first call runs', async () => {
    const { interceptor, ctx, store } = build();
    await run(interceptor, ctx('act-2').context, () => ({}));
    await expect(interceptor.intercept(ctx('act-2', { to: 'IN_PROGRESS' }).context, { handle: () => of({}) } as never)).rejects.toMatchObject({
      code: 'idempotency_key_reused',
    });
    const fp = createHash('sha256').update(`PATCH /api/v1/errands/e-1/status\n${JSON.stringify({ to: 'ARRIVED' })}`).digest('hex');
    store.set('idem:errand-status:u-1:act-3', JSON.stringify({ fp, pending: true }));
    await expect(interceptor.intercept(ctx('act-3').context, { handle: () => of({}) } as never)).rejects.toMatchObject({
      code: 'idempotency_in_progress',
    });
  });

  it('releases the key when the call fails, so a retry runs again', async () => {
    const { interceptor, ctx, store } = build();
    const failed = await interceptor.intercept(ctx('act-4').context, { handle: () => throwError(() => new Error('409')) } as never);
    await expect(lastValueFrom(failed)).rejects.toThrow('409');
    expect(store.has('idem:errand-status:u-1:act-4')).toBe(false);
  });

  it('rejects an empty or over-long key', async () => {
    const { interceptor, ctx } = build();
    await expect(interceptor.intercept(ctx('  ').context, { handle: () => of({}) } as never)).rejects.toMatchObject({
      code: 'idempotency_key_invalid',
    });
    await expect(interceptor.intercept(ctx('x'.repeat(129)).context, { handle: () => of({}) } as never)).rejects.toMatchObject({
      code: 'idempotency_key_invalid',
    });
  });

  it('runs unprotected when Redis is down', async () => {
    const { interceptor, redis, ctx } = build();
    redis.setIfAbsent.mockRejectedValueOnce(new Error('down'));
    await expect(run(interceptor, ctx('act-5').context, () => ({ ok: true }))).resolves.toEqual({ ok: true });
  });
});
