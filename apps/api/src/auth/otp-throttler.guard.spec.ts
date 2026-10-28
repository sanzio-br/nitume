import { describe, expect, it } from 'vitest';
import { ApiError } from '../common/api-error';
import { OTP_VERIFY_THROTTLER, OtpThrottlerGuard } from './otp-throttler.guard';

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

describe('OtpThrottlerGuard shared buckets (WQ-8)', () => {
  const keyOf = (bucket: string | undefined, className: string, handlerName: string): string => {
    const reflector = { get: () => bucket };
    const guard = new OtpThrottlerGuard([], {} as never, reflector as never);
    const handler = { [handlerName]: () => undefined }[handlerName];
    const ctx = { getClass: () => ({ name: className }), getHandler: () => handler };
    return (guard as unknown as {
      generateKey: (c: unknown, suffix: string, name: string) => string;
    }).generateKey(ctx, '1.2.3.4', OTP_VERIFY_THROTTLER);
  };

  it('a web verify route counts in the mobile route bucket', () => {
    const mobile = keyOf(undefined, 'AuthController', 'verifyOtp');
    expect(keyOf('AuthController-verifyOtp', 'WebAuthController', 'verifyOtp')).toBe(mobile);
  });

  it('routes without a bucket keep their own key', () => {
    expect(keyOf(undefined, 'WebAuthController', 'verifyOtp')).not.toBe(
      keyOf(undefined, 'AuthController', 'verifyOtp'),
    );
  });
});
