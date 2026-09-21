/**
 * Delivery channel for OTP codes. The provider is selected via
 * `otp.senderTransport` (console in dev; africas_talking in a real env).
 * Wiring a real SMS account requires project-owner approval per the
 * build instructions (Section 3 — no real third-party accounts without
 * confirmation) and ATSMS_* credentials.
 */
export abstract class OtpSender {
  abstract readonly name: string;
  abstract send(phone: string, code: string): Promise<void>;
}