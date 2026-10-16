import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_OTP_TTL_SECONDS, otpExpiryPhrase } from '../../common/otp-expiry';
import { OtpSender } from './otp-sender.interface';

/**
 * Africa's Talking SMS sender (named in Nitume_System_Design.md §4.4).
 * Requires ATSMS_API_KEY / ATSMS_USERNAME / ATSMS_SENDER_ID to be set and
 * the OTP_SENDER_TRANSPORT=africas_talking to be enabled. Never enabled
 * against a real account without project-owner approval.
 */
@Injectable()
export class AfricasTalkingOtpSender extends OtpSender {
  readonly name = 'africas_talking';
  private readonly logger = new Logger(AfricasTalkingOtpSender.name);

  constructor(private readonly config: ConfigService) {
    super();
  }

  /**
   * OTP SMS body, owner wording (row 158): "Your Nitume verification code is
   * {code}. It expires in 5 minutes. Do not share this code with anyone." The
   * minutes come from `otp.ttlSeconds` (300 s -> 5 minutes). The email copy
   * is separate (MailService.otpText) and unchanged.
   */
  static otpText(code: string, ttlSeconds: number): string {
    return `Your Nitume verification code is ${code}. It expires in ${otpExpiryPhrase(ttlSeconds)}. Do not share this code with anyone.`;
  }

  async send(phone: string, code: string): Promise<void> {
    const apiKey = this.config.get<string>('atsms.apiKey');
    const username = this.config.get<string>('atsms.username');
    const senderId = this.config.get<string>('atsms.senderId');

    if (!apiKey || !username) {
      throw new Error(
        'AFRICAS_TALKING SMS sender selected but ATSMS_API_KEY / ATSMS_USERNAME are not configured',
      );
    }
    const form = new URLSearchParams({
      username,
      to: phone,
      message: AfricasTalkingOtpSender.otpText(
        code,
        this.config.get<number>('otp.ttlSeconds', DEFAULT_OTP_TTL_SECONDS),
      ),
      ...(senderId ? { from: senderId } : {}),
    });
    const response = await fetch(
      `https://api.africastalking.com/version1/messaging?${form.toString()}`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          apiKey,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );
    if (!response.ok) {
      this.logger.error(
        `AT SMS failed: ${response.status} ${await response.text()}`,
      );
      throw new Error('SMS delivery failed');
    }
  }
}