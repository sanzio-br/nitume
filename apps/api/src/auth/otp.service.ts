import {
  BadRequestException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { ApiError } from '../common/api-error';
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

/** Machine-readable `code` values on OTP error responses. */
export enum OtpErrorCode {
  /** 401. Wrong code; body has `attemptsRemaining`. */
  INCORRECT = 'otp_incorrect',
  /** 401. Newest code has expired (5 min) or was replaced by a newer one. */
  EXPIRED = 'otp_expired',
  /** 401. Max verification attempts used on this code; request a new one. */
  ATTEMPTS_EXHAUSTED = 'otp_attempts_exhausted',
  /** 401. No unused code exists for this phone/email. */
  NOT_REQUESTED = 'otp_not_requested',
  /** 429. Resend cooldown; body has `secondsRemaining` (= `retryAfterSeconds`). */
  RESEND_COOLDOWN = 'otp_resend_cooldown',
  /** 429. Too many codes in the window; body has `retryAfterSeconds`. */
  RATE_LIMITED = 'otp_rate_limited',
  /** 400. SMS/email delivery failed; safe to retry immediately. */
  DELIVERY_FAILED = 'otp_delivery_failed',
}

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/**
 * OTP issuance + verification, backed by Postgres through the `otp_codes`
 * table. Every issued code is stored (hashed) and single-use. Policy (owner
 * decision Q17, defaults in config): 5-minute expiry, 5 verification
 * attempts per code, 60s resend cooldown, 5 codes per hour per phone/email,
 * and a new code invalidates the previous ones. Per-IP throttling is not
 * applied here (no throttler in the framework setup; owner question).
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
    await this.issue(OtpChannel.PHONE, phone, (code) => this.sender.send(phone, code));
  }

  verifyCode(rawPhone: string, code: string): Promise<void> {
    const phone = normalizePhone(rawPhone);
    return this.consumeCode(OtpChannel.PHONE, phone, code);
  }

  async requestEmailCode(rawEmail: string): Promise<void> {
    const email = normalizeEmail(rawEmail);
    await this.issue(OtpChannel.EMAIL, email, (code) => this.mail.sendOtp(email, code));
  }

  verifyEmailCode(rawEmail: string, code: string): Promise<void> {
    const email = normalizeEmail(rawEmail);
    return this.consumeCode(OtpChannel.EMAIL, email, code);
  }

  /**
   * Issues a code under the owner OTP policy (Q17): resend cooldown, max
   * requests per rolling window per target, and a new code invalidates every
   * earlier unused code for the same target.
   */
  private async issue(
    channel: OtpChannel,
    target: string,
    deliver: (code: string) => Promise<unknown>,
  ): Promise<void> {
    const cfg = this.otpConfig();
    const now = new Date();

    const cooldownLeft = await this.resendCooldownSeconds(channel, target, now);
    if (cooldownLeft > 0) {
      throw new ApiError(
        HttpStatus.TOO_MANY_REQUESTS,
        OtpErrorCode.RESEND_COOLDOWN,
        `Please wait ${cooldownLeft}s before requesting another code.`,
        { secondsRemaining: cooldownLeft, retryAfterSeconds: cooldownLeft },
      );
    }

    const windowStart = new Date(now.getTime() - cfg.rateLimitWindowSeconds * 1000);
    const inWindow = await this.otpCodes.find({
      where: { channel, target, createdAt: MoreThan(windowStart) },
      order: { createdAt: 'ASC' },
      take: cfg.rateLimitPerPhone,
    });
    if (inWindow.length >= cfg.rateLimitPerPhone) {
      const oldest = inWindow[0].createdAt.getTime();
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((oldest + cfg.rateLimitWindowSeconds * 1000 - now.getTime()) / 1000),
      );
      throw new ApiError(
        HttpStatus.TOO_MANY_REQUESTS,
        OtpErrorCode.RATE_LIMITED,
        'Too many verification codes requested. Try again later.',
        { retryAfterSeconds },
      );
    }

    // A new code invalidates every earlier unused one for this target.
    await this.otpCodes.update(
      { channel, target, consumedAt: IsNull(), expiresAt: MoreThan(now) },
      { expiresAt: now },
    );

    const code = randomInt(100000, 1000000).toString();
    const codeRow = this.otpCodes.create({
      channel,
      target,
      codeHash: this.hash(code),
      expiresAt: new Date(now.getTime() + cfg.ttlSeconds * 1000),
      resendLockUntil: new Date(now.getTime() + cfg.resendCooldownSeconds * 1000),
    });
    await this.otpCodes.save(codeRow);

    try {
      await deliver(code);
    } catch (err) {
      this.logger.error(
        `Failed to deliver OTP via ${channel}:`,
        err instanceof Error ? err.message : err,
      );
      // Unusable code and no cooldown so the user may retry at once; the row
      // still counts toward the rate-limit window.
      await this.otpCodes.update(
        { id: codeRow.id },
        { expiresAt: new Date(0), resendLockUntil: null },
      );
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        OtpErrorCode.DELIVERY_FAILED,
        'Could not deliver the verification code. Try again.',
      );
    }
  }

  private async consumeCode(channel: OtpChannel, target: string, code: string): Promise<void> {
    const { maxAttempts } = this.otpConfig();
    const now = new Date();

    // Only the newest unused code can be verified; issuing a code expires
    // the earlier ones.
    const latest = await this.otpCodes.findOne({
      where: { channel, target, consumedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    if (!latest) {
      throw new ApiError(
        HttpStatus.UNAUTHORIZED,
        OtpErrorCode.NOT_REQUESTED,
        'No verification code was requested. Request a new one.',
      );
    }
    if (latest.expiresAt.getTime() <= now.getTime()) {
      throw new ApiError(
        HttpStatus.UNAUTHORIZED,
        OtpErrorCode.EXPIRED,
        'This verification code has expired. Request a new one.',
      );
    }
    // Reserve an attempt atomically before comparing, so concurrent
    // verifies can never use more than maxAttempts on one code.
    const attempts = await this.reserveAttempt(latest.id, maxAttempts);
    if (attempts === null) {
      throw new ApiError(
        HttpStatus.UNAUTHORIZED,
        OtpErrorCode.ATTEMPTS_EXHAUSTED,
        'Too many incorrect attempts. Request a new code.',
      );
    }

    if (!this.safeEqual(latest.codeHash, this.hash(code))) {
      if (attempts >= maxAttempts) {
        throw new ApiError(
          HttpStatus.UNAUTHORIZED,
          OtpErrorCode.ATTEMPTS_EXHAUSTED,
          'Too many incorrect attempts. Request a new code.',
        );
      }
      throw new ApiError(
        HttpStatus.UNAUTHORIZED,
        OtpErrorCode.INCORRECT,
        'Incorrect verification code.',
        { attemptsRemaining: maxAttempts - attempts },
      );
    }

    // Single-use: only one concurrent verify may consume the code.
    const consumed = await this.otpCodes.update(
      { id: latest.id, consumedAt: IsNull() },
      { consumedAt: now },
    );
    if (!consumed.affected) {
      throw new ApiError(
        HttpStatus.UNAUTHORIZED,
        OtpErrorCode.NOT_REQUESTED,
        'No verification code was requested. Request a new one.',
      );
    }
  }

  /**
   * One atomic `attempts + 1` on an unused code that still has attempts
   * left. Returns the new count, or null when none are left (or the code
   * was consumed meanwhile).
   */
  private async reserveAttempt(id: string, maxAttempts: number): Promise<number | null> {
    const result: unknown = await this.otpCodes.query(
      `UPDATE "otp_codes" SET "attempts" = "attempts" + 1
        WHERE "id" = $1 AND "attempts" < $2 AND "consumedAt" IS NULL
        RETURNING "attempts"`,
      [id, maxAttempts],
    );
    // The postgres driver returns [rows, rowCount] for UPDATE.
    const rows = (Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result) as
      | { attempts: number }[]
      | undefined;
    const row = Array.isArray(rows) ? rows[0] : undefined;
    return row ? Number(row.attempts) : null;
  }

  /** Seconds left on the newest unused code's resend lock (0 = may resend). */
  private async resendCooldownSeconds(
    channel: OtpChannel,
    target: string,
    now: Date,
  ): Promise<number> {
    const latest = await this.otpCodes.findOne({
      where: { channel, target, consumedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    const lockUntil = latest?.resendLockUntil?.getTime() ?? 0;
    return lockUntil > now.getTime() ? Math.ceil((lockUntil - now.getTime()) / 1000) : 0;
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
      ttlSeconds: this.config.get<number>('otp.ttlSeconds', 300),
      maxAttempts: this.config.get<number>('otp.maxAttempts', 5),
      resendCooldownSeconds: this.config.get<number>('otp.resendCooldownSeconds', 60),
      rateLimitWindowSeconds: this.config.get<number>('otp.rateLimitWindowSeconds', 3600),
      rateLimitPerPhone: this.config.get<number>('otp.rateLimitPerPhone', 5),
    };
  }
}