import { describe, expect, it } from 'vitest';
import { AfricasTalkingOtpSender } from './africas-talking-otp-sender';

describe('AfricasTalkingOtpSender OTP copy', () => {
  it('says 5 minutes with the 300 s TTL', () => {
    expect(AfricasTalkingOtpSender.otpText('123456', 300)).toBe(
      'Nitume verification code: 123456. Your verification code expires in 5 minutes. Do not share it.',
    );
  });
});
