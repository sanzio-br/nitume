import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
      message: `Nitume verification code: ${code}. Valid 10 minutes. Do not share it.`,
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