import { ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';
import { ApiError } from '../common/api-error';

/** Named throttlers used on the OTP routes (row 53). */
export const OTP_REQUEST_THROTTLER = 'otpRequest';
export const OTP_VERIFY_THROTTLER = 'otpVerify';

/**
 * Per-IP throttling of the OTP endpoints, on top of the per-phone/email
 * policy in OtpService. 429 body: `{ code: 'otp_ip_rate_limited',
 * retryAfterSeconds }`.
 */
@Injectable()
export class OtpThrottlerGuard extends ThrottlerGuard {
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
