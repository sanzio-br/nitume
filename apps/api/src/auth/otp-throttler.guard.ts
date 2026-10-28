import { ExecutionContext, HttpStatus, Injectable, SetMetadata } from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';
import { createHash } from 'node:crypto';
import { ApiError } from '../common/api-error';

/** Named throttlers used on the OTP routes (row 53). */
export const OTP_REQUEST_THROTTLER = 'otpRequest';
export const OTP_VERIFY_THROTTLER = 'otpVerify';

/** Per-IP limit on issuing codes (row 53). */
export const ThrottleOtpRequest = () => SkipThrottle({ [OTP_VERIFY_THROTTLER]: true });
/** Per-IP limit on verifying codes (row 53). */
export const ThrottleOtpVerify = () => SkipThrottle({ [OTP_REQUEST_THROTTLER]: true });

export const OTP_THROTTLE_BUCKET = 'nitume:otpThrottleBucket';

/**
 * Counts a route in another route's per-IP bucket, named
 * `<Controller>-<handler>` (the throttler's default key prefix). The web
 * verify routes (WQ-8) share the mobile routes' buckets, so a second path to
 * the same OTP check never doubles the per-IP limit.
 */
export const OtpThrottleBucket = (bucket: string) => SetMetadata(OTP_THROTTLE_BUCKET, bucket);

/**
 * Per-IP throttling of the OTP endpoints, on top of the per-phone/email
 * policy in OtpService. 429 body: `{ code: 'otp_ip_rate_limited',
 * retryAfterSeconds }`.
 */
@Injectable()
export class OtpThrottlerGuard extends ThrottlerGuard {
  protected generateKey(context: ExecutionContext, suffix: string, name: string): string {
    const bucket = this.reflector.get<string | undefined>(OTP_THROTTLE_BUCKET, context.getHandler());
    if (!bucket) {
      return super.generateKey(context, suffix, name);
    }
    // Same format as ThrottlerGuard.generateKey, with the shared bucket name.
    return createHash('sha256').update(`${bucket}-${name}-${suffix}`).digest('hex');
  }

  protected throwThrottlingException(
    _context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const retryAfterSeconds = Math.max(detail.timeToBlockExpire, 1);
    throw new ApiError(
      HttpStatus.TOO_MANY_REQUESTS,
      'otp_ip_rate_limited',
      `Too many verification requests from this network. Try again in ${retryAfterSeconds}s.`,
      { retryAfterSeconds },
    );
  }
}
