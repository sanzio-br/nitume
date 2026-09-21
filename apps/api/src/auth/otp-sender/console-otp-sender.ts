import { Injectable, Logger } from '@nestjs/common';
import { OtpSender } from './otp-sender.interface';

/** Dev transport: logs the code (also used for e2e/tests). */
@Injectable()
export class ConsoleOtpSender extends OtpSender {
  readonly name = 'console';
  private readonly logger = new Logger(ConsoleOtpSender.name);

  async send(phone: string, code: string): Promise<void> {
    this.logger.log(`OTP for ${phone}: ${code}`);
  }
}