import { describe, expect, it } from 'vitest';
import { MailService } from './mail.service';

describe('MailService OTP copy (owner decision 2026-10-16)', () => {
  it('says the code expires in 5 minutes with the 300 s TTL', () => {
    expect(MailService.otpText('123456', 300)).toBe(
      'Your Nitume verification code is 123456. Your verification code expires in 5 minutes. Do not share it.',
    );
  });

  it('follows the configured TTL', () => {
    expect(MailService.otpText('123456', 600)).toContain('expires in 10 minutes');
  });
});
