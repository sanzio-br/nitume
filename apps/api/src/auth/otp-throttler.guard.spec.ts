import { describe, expect, it } from 'vitest';
import { ApiError } from '../common/api-error';
import { OtpThrottlerGuard } from './otp-throttler.guard';

describe('OtpThrottlerGuard (row 53)', () => {
  it('answers 429 otp_ip_rate_limited with retryAfterSeconds', () => {
    const guard = new OtpThrottlerGuard([], {} as never, {} as never);
    let err: unknown;
    try {
      void (guard as unknown as {
        throwThrottlingException: (c: unknown, d: { timeToBlockExpire: number }) => Promise<void>;
      }).throwThrottlingException({}, { timeToBlockExpire: 42 });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).getStatus()).toBe(429);
    expect((err as ApiError).getResponse()).toMatchObject({
      code: 'otp_ip_rate_limited',
      retryAfterSeconds: 42,
    });
  });
});
