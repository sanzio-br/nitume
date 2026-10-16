import { describe, expect, it } from 'vitest';
import { AfricasTalkingOtpSender } from './africas-talking-otp-sender';

describe('AfricasTalkingOtpSender OTP copy', () => {
  it('uses the owner wording with 5 minutes from the 300 s TTL (row 158)', () => {
    expect(AfricasTalkingOtpSender.otpText('123456', 300)).toBe(
      'Your Nitume verification code is 123456. It expires in 5 minutes. Do not share this code with anyone.',
    );
  });

  it('derives the minutes from the TTL', () => {
    expect(AfricasTalkingOtpSender.otpText('123456', 600)).toContain('It expires in 10 minutes.');
  });
});
