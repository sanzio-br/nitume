import { describe, expect, it } from 'vitest';
import { otpExpiryPhrase } from './otp-expiry';

describe('otpExpiryPhrase (owner decision 2026-10-16)', () => {
  it('says 5 minutes for the 300 s TTL', () => {
    expect(otpExpiryPhrase(300)).toBe('5 minutes');
  });

  it('rounds down so it never promises more time than the code has', () => {
    expect(otpExpiryPhrase(359)).toBe('5 minutes');
    expect(otpExpiryPhrase(60)).toBe('1 minute');
    expect(otpExpiryPhrase(45)).toBe('45 seconds');
  });
});
