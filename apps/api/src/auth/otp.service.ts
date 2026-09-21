import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { OtpChannel } from '../common/enums';
import { MailService } from '../infra/mail/mail.service';
import { OtpCode } from './otp-code.entity';
import { OtpSender } from './otp-sender/otp-sender.interface';
import { OTP_SENDER } from './otp-sender/otp-sender.provider';

export const PHONE_REGEX = /^(?:\+?254|0)([17]\d{8})$/;

export const normalizePhone = (phone: string): string => {
  const match = PHONE_REGEX.exec(phone.trim());
  if (!match) {
    throw new BadRequestException(
      'Phone must be a valid Kenyan number (e.g. 0712345678 or +254712345678)',
    );
  }
  return `+254${match[1]}`;
};

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/**
 * OTP issuance + verification, fully backed by Postgres through the
 * append-only `otp_codes` table. Every issued code is stored (hashed),
 * disputes are bounded per-target, and codes are single-use. No Redis is
 * involved in the OTP path.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    @InjectRepository(OtpCode) private readonly otpCodes: Repository<OtpCode>,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    @Inject(OTP_SENDER) private readonly sender: OtpSender,
  ) {}

  async requestCode(rawPhone: string): Promise<void> {
    const phone = normalizePhone(rawPhone);
    const cfg = this.otpConfig();

    const requestsInWindow = await this.otpCodes.count({
      where: {
        channel: OtpChannel.PHONE,
        target: phone,
        createdAt: MoreThan(new Date(Date.now() - cfg.rateLimitWindowSeconds * 1000)),
      },
    });
    if (requestsInWindow >= cfg.rateLimitPerPhone) {
      throw new HttpException(
        'Too many OTP requests. Try again in a few minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (await this.resendBlocked(OtpChannel.PHONE, phone, cfg.resendCooldownSeconds)) {
      throw new HttpException(
        `Please wait ${cfg.resendCooldownSeconds}s before requesting another code.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = randomInt(100000, 1000000).toString();
    const now = new Date();
    const codeRow = this.otpCodes.create({
      channel: OtpChannel.PHONE,
      target: phone,
      codeHash: this.hash(code),
      expiresAt: new Date(now.getTime() + cfg.ttlSeconds * 1000),
      resendLockUntil: new Date(now.getTime() + cfg.resendCooldownSeconds * 1000),
    });
    await this.otpCodes.save(codeRow);

    try {
      await this.sender.send(phone, code);
    } catch (err) {
      this.logger.error(
        `Failed to deliver OTP to ${phone}:`,
        err instanceof Error ? err.message : err,
      );
      // Mark the code unusable (expired) and clear the resend lock so the
      // customer may immediately retry. The row still counts toward the
      // rate-limited window (like the old Redis counter did).
      await this.otpCodes.update(
        { id: codeRow.id },
        { expiresAt: new Date(0), resendLockUntil: null },
      );
      throw new BadRequestException('Could not deliver the verification code. Try again.');
    }
  }

  verifyCode(rawPhone: string, code: string): Promise<void> {
    const phone = normalizePhone(rawPhone);
    return this.consumeCode(OtpChannel.PHONE, phone, code);
  }

  async requestEmailCode(rawEmail: string): Promise<void> {
    const email = normalizeEmail(rawEmail);
    const cfg = this.otpConfig();

    const requestsInWindow = await this.otpCodes.count({
      where: {
        channel: OtpChannel.EMAIL,
        target: email,
        createdAt: MoreThan(new Date(Date.now() - cfg.rateLimitWindowSeconds * 1000)),
      },
    });
    if (requestsInWindow >= cfg.rateLimitPerPhone) {
      throw new HttpException(
        'Too many OTP requests. Try again in a few minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (await this.resendBlocked(OtpChannel.EMAIL, email, cfg.resendCooldownSeconds)) {
      throw new HttpException(
        `Please wait ${cfg.resendCooldownSeconds}s before requesting another code.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = randomInt(100000, 1000000).toString();
    const now = new Date();
    const codeRow = this.otpCodes.create({
      channel: OtpChannel.EMAIL,
      target: email,
      codeHash: this.hash(code),
      expiresAt: new Date(now.getTime() + cfg.ttlSeconds * 1000),
      resendLockUntil: new Date(now.getTime() + cfg.resendCooldownSeconds * 1000),
    });
    await this.otpCodes.save(codeRow);

    try {
      await this.mail.sendOtp(email, code);
    } catch (err) {
      this.logger.error(
        `Failed to email OTP to ${email}:`,
        err instanceof Error ? err.message : err,
      );
      await this.otpCodes.update(
        { id: codeRow.id },
        { expiresAt: new Date(0), resendLockUntil: null },
      );
      throw new BadRequestException('Could not email the verification code. Try again.');
    }
  }

  verifyEmailCode(rawEmail: string, code: string): Promise<void> {
    const email = normalizeEmail(rawEmail);
    return this.consumeCode(OtpChannel.EMAIL, email, code);
  }

  private async consumeCode(channel: OtpChannel, target: string, code: string): Promise<void> {
    const { maxAttempts } = this.otpConfig();

    // The active code is the most recent one that has not been consumed and
    // has not expired.
    const active = await this.otpCodes.findOne({
      where: {
        channel,
        target,
        consumedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'DESC' },
    });

    if (!active) {
      throw new UnauthorizedException('No active verification code. Request a new one.');
    }

    if (active.attempts >= maxAttempts) {
      throw new UnauthorizedException('Too many incorrect attempts. Request a new code.');
    }

    if (!this.safeEqual(active.codeHash, this.hash(code))) {
      await this.otpCodes.update(
        { id: active.id },
        { attempts: active.attempts + 1 },
      );
      throw new UnauthorizedException('Incorrect verification code.');
    }

    // Single-use: the code is consumed on success.
    await this.otpCodes.update({ id: active.id }, { consumedAt: new Date() });
  }

  /**
   * True when a code was issued for this target within the cooldown window
   * and has not been consumed yet (a successful verify clears the lock,
   * mirroring the old Redis `resend` key deletion).
   */
  private async resendBlocked(
    channel: OtpChannel,
    target: string,
    cooldownSeconds: number,
  ): Promise<boolean> {
    const latest = await this.otpCodes.findOne({
      where: {
        channel,
        target,
        consumedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
        createdAt: MoreThan(new Date(Date.now() - cooldownSeconds * 1000)),
      },
      order: { createdAt: 'DESC' },
    });
    return latest !== null && (latest.resendLockUntil?.getTime() ?? 0) > Date.now();
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  }

  private otpConfig(): {
    ttlSeconds: number;
    maxAttempts: number;
    resendCooldownSeconds: number;
    rateLimitWindowSeconds: number;
    rateLimitPerPhone: number;
  } {
    return {
      ttlSeconds: this.config.get<number>('otp.ttlSeconds', 600),
      maxAttempts: this.config.get<number>('otp.maxAttempts', 5),
      resendCooldownSeconds: this.config.get<number>('otp.resendCooldownSeconds', 60),
      rateLimitWindowSeconds: this.config.get<number>('otp.rateLimitWindowSeconds', 900),
      rateLimitPerPhone: this.config.get<number>('otp.rateLimitPerPhone', 5),
    };
  }
}