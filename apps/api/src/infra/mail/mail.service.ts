import { Logger, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/**
 * SMTP mailer for transactional email. Reads `mail.*` from env; when
 * MAIL_HOST is not configured it logs the message instead of sending, so
 * dev flows (and the e2e suite) run without a mail server.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null | undefined;

  constructor(private readonly config: ConfigService) {}

  async sendOtp(email: string, code: string): Promise<void> {
    const fromAddress =
      this.config.get<string | null>('mail.fromAddress') ?? 'no-reply@nitume';
    const fromName = this.config.get<string>('mail.fromName', 'Nitume');
    const subject = 'Nitume verification code';
    const text = `Your Nitume verification code is ${code}. It expires in 10 minutes. Do not share it.`;

    const client = this.client();
    if (!client) {
      this.logger.log(`[mail:console] OTP for ${email}: ${code}`);
      return;
    }
    await client.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      to: email,
      subject,
      text,
    });
    this.logger.log(`OTP emailed to ${email}`);
  }

  private client(): Transporter | null {
    if (this.transporter !== undefined) {
      return this.transporter;
    }
    const host = this.config.get<string | null>('mail.host');
    if (!host) {
      this.transporter = null;
      return null;
    }
    this.transporter = nodemailer.createTransport({
      host,
      port: this.config.get<number>('mail.port', 465),
      secure: this.config.get<boolean>('mail.secure', false),
      auth: {
        user: this.config.get<string | null>('mail.username') ?? '',
        pass: this.config.get<string | null>('mail.password') ?? '',
      },
    });
    return this.transporter;
  }
}