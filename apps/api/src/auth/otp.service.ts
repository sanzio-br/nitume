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
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { RedisService } from '../infra/redis/redis.service';
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

const codeKey = (phone: string): string => `otp:code:${phone}`;
const attemptsKey = (phone: string): string => `otp:attempts:${phone}`;
const resendKey = (phone: string): string => `otp:resend:${phone}`;
const rateLimitKey = (phone: string): string => `otp:rl:${phone}`;

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    @Inject(OTP_SENDER) private readonly sender: OtpSender,
  ) {}

  async requestCode(rawPhone: string): Promise<void> {
    const phone = normalizePhone(rawPhone);
    const { ttlSeconds, resendCooldownSeconds, rateLimitWindowSeconds, rateLimitPerPhone } =
      this.otpConfig();

    const requestsInWindow = await this.redis.incrementWithTtl(
      rateLimitKey(phone),
      rateLimitWindowSeconds,
    );
    if (requestsInWindow > rateLimitPerPhone) {
      throw new HttpException(
        `Too many OTP requests. Try again in a few minutes.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (await this.redis.get(resendKey(phone))) {
      throw new HttpException(
        `Please wait ${resendCooldownSeconds}s before requesting another code.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = randomInt(100000, 1000000).toString();
    await this.redis.set(codeKey(phone), this.hash(code), ttlSeconds);
    await this.redis.set(resendKey(phone), '1', resendCooldownSeconds);

    try {
      await this.sender.send(phone, code);
    } catch (err) {
      this.logger.error(`Failed to deliver OTP to ${phone}:`, err instanceof Error ? err.message : err);
      // The code was issued; mark it unusable since it was never delivered.
      await this.redis.del(codeKey(phone), resendKey(phone));
      throw new BadRequestException('Could not deliver the verification code. Try again.');
    }
  }

  verifyCode(rawPhone: string, code: string): Promise<void> {
    return this.consumeCode(rawPhone, code);
  }

  private async consumeCode(rawPhone: string, code: string): Promise<void> {
    const phone = normalizePhone(rawPhone);
    const { maxAttempts } = this.otpConfig();

    const attempts = Number(await this.redis.get(attemptsKey(phone)) ?? 0);
    if (attempts >= maxAttempts) {
      throw new UnauthorizedException('Too many incorrect attempts. Request a new code.');
    }

    const stored = await this.redis.get(codeKey(phone));
    if (!stored) {
      throw new UnauthorizedException('No active verification code. Request a new one.');
    }

    if (!this.safeEqual(stored, this.hash(code))) {
      await this.redis.set(attemptsKey(phone), (attempts + 1).toString(), this.config.get<number>('otp.ttlSeconds', 600));
      throw new UnauthorizedException('Incorrect verification code.');
    }

    // Single-use: the code is consumed on success.
    await this.redis.del(codeKey(phone), attemptsKey(phone), resendKey(phone));
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