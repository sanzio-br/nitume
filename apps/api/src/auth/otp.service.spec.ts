import { HttpStatus } from '@nestjs/common';
import { FindOperator } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../common/api-error';
import { OtpChannel } from '../common/enums';
import { OtpCode } from './otp-code.entity';
import { OtpErrorCode, OtpService } from './otp.service';

type Where = Record<string, unknown>;

/** Minimal in-memory stand-in for Repository<OtpCode>. */
class FakeOtpRepo {
  rows: OtpCode[] = [];
  private seq = 0;

  private matches(row: OtpCode, where: Where): boolean {
    return Object.entries(where).every(([key, expected]) => {
      const actual = (row as unknown as Record<string, unknown>)[key];
      if (expected instanceof FindOperator) {
        if (expected.type === 'isNull') return actual === null || actual === undefined;
        if (expected.type === 'moreThan') {
          return (actual as Date).getTime() > (expected.value as Date).getTime();
        }
        throw new Error(`unsupported operator ${expected.type}`);
      }
      return actual === expected;
    });
  }

  private sorted(where: Where, order?: Record<string, 'ASC' | 'DESC'>): OtpCode[] {
    const rows = this.rows.filter((r) => this.matches(r, where));
    if (order?.createdAt) {
      const dir = order.createdAt === 'ASC' ? 1 : -1;
      rows.sort((a, b) => dir * (a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)));
    }
    return rows;
  }

  find(opts: { where: Where; order?: Record<string, 'ASC' | 'DESC'>; take?: number }) {
    const rows = this.sorted(opts.where, opts.order);
    return Promise.resolve(opts.take ? rows.slice(0, opts.take) : rows);
  }

  findOne(opts: { where: Where; order?: Record<string, 'ASC' | 'DESC'> }) {
    return Promise.resolve(this.sorted(opts.where, opts.order)[0] ?? null);
  }

  create(data: Partial<OtpCode>): OtpCode {
    return Object.assign(new OtpCode(), { attempts: 0, consumedAt: null, ...data });
  }

  save(row: OtpCode) {
    this.seq += 1;
    row.id = `otp-${String(this.seq).padStart(3, '0')}`;
    row.createdAt = new Date();
    this.rows.push(row);
    return Promise.resolve(row);
  }

  update(where: Where, patch: Partial<OtpCode>) {
    const hit = this.rows.filter((r) => this.matches(r, where));
    hit.forEach((r) => Object.assign(r, patch));
    return Promise.resolve({ affected: hit.length });
  }
}

const config = {
  get: (key: string, fallback: unknown) =>
    ({
      'otp.ttlSeconds': 300,
      'otp.maxAttempts': 5,
      'otp.resendCooldownSeconds': 60,
      'otp.rateLimitWindowSeconds': 3600,
      'otp.rateLimitPerPhone': 5,
    })[key] ?? fallback,
};

const PHONE = '0712345678';

const errorOf = async (p: Promise<unknown>): Promise<ApiError> => {
  try {
    await p;
  } catch (err) {
    if (err instanceof ApiError) return err;
    throw err;
  }
  throw new Error('expected an ApiError');
};

describe('OtpService policy (owner Q17)', () => {
  let repo: FakeOtpRepo;
  let sent: string[];
  let service: OtpService;
  const send = vi.fn((_phone: string, code: string) => {
    sent.push(code);
    return Promise.resolve();
  });

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-10-07T08:00:00Z'), toFake: ['Date'] });
    repo = new FakeOtpRepo();
    sent = [];
    send.mockClear();
    service = new OtpService(repo as never, config as never, {} as never, { send } as never);
  });

  afterEach(() => vi.useRealTimers());

  const advance = (seconds: number) => vi.setSystemTime(Date.now() + seconds * 1000);

  it('issues a code that expires after 5 minutes', async () => {
    await service.requestCode(PHONE);
    expect(repo.rows[0].expiresAt.getTime() - Date.now()).toBe(300_000);
    advance(301);
    const err = await errorOf(service.verifyCode(PHONE, sent[0]));
    expect(err.code).toBe(OtpErrorCode.EXPIRED);
    expect(err.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
  });

  it('verifies once (single use)', async () => {
    await service.requestCode(PHONE);
    await service.verifyCode(PHONE, sent[0]);
    const err = await errorOf(service.verifyCode(PHONE, sent[0]));
    expect(err.code).toBe(OtpErrorCode.NOT_REQUESTED);
  });

  it('enforces a 60s resend cooldown with secondsRemaining', async () => {
    await service.requestCode(PHONE);
    advance(15);
    const err = await errorOf(service.requestCode(PHONE));
    expect(err.code).toBe(OtpErrorCode.RESEND_COOLDOWN);
    expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(err.getResponse()).toMatchObject({ secondsRemaining: 45, retryAfterSeconds: 45 });
    advance(45);
    await expect(service.requestCode(PHONE)).resolves.toBeUndefined();
  });

  it('invalidates the previous code when a new one is issued', async () => {
    await service.requestCode(PHONE);
    advance(61);
    await service.requestCode(PHONE);
    const first = repo.rows[0];
    expect(first.expiresAt.getTime()).toBeLessThanOrEqual(Date.now());
    // The old code no longer works; the new one does.
    const err = await errorOf(service.verifyCode(PHONE, sent[0] === sent[1] ? '000000' : sent[0]));
    expect(err.code).toBe(OtpErrorCode.INCORRECT);
    await service.verifyCode(PHONE, sent[1]);
  });

  it('allows 5 attempts, reporting attemptsRemaining, then exhausts', async () => {
    await service.requestCode(PHONE);
    const wrong = sent[0] === '111111' ? '222222' : '111111';
    for (let left = 4; left >= 1; left--) {
      const err = await errorOf(service.verifyCode(PHONE, wrong));
      expect(err.code).toBe(OtpErrorCode.INCORRECT);
      expect(err.getResponse()).toMatchObject({ attemptsRemaining: left });
    }
    const fifth = await errorOf(service.verifyCode(PHONE, wrong));
    expect(fifth.code).toBe(OtpErrorCode.ATTEMPTS_EXHAUSTED);
    // Even the right code is refused once exhausted.
    const after = await errorOf(service.verifyCode(PHONE, sent[0]));
    expect(after.code).toBe(OtpErrorCode.ATTEMPTS_EXHAUSTED);
  });

  it('caps requests at 5 per hour per phone with retryAfterSeconds', async () => {
    for (let i = 0; i < 5; i++) {
      await service.requestCode(PHONE);
      advance(61);
    }
    const err = await errorOf(service.requestCode(PHONE));
    expect(err.code).toBe(OtpErrorCode.RATE_LIMITED);
    expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    // First code was issued 5 * 61s ago; the window is one hour.
    expect(err.getResponse()).toMatchObject({ retryAfterSeconds: 3600 - 5 * 61 });
    // A different phone is not affected.
    await expect(service.requestCode('0798765432')).resolves.toBeUndefined();
  });

  it('reports otp_not_requested when no code exists', async () => {
    const err = await errorOf(service.verifyCode(PHONE, '123456'));
    expect(err.code).toBe(OtpErrorCode.NOT_REQUESTED);
  });

  it('clears the cooldown when delivery fails', async () => {
    send.mockImplementationOnce(() => Promise.reject(new Error('sms down')));
    const err = await errorOf(service.requestCode(PHONE));
    expect(err.code).toBe(OtpErrorCode.DELIVERY_FAILED);
    await expect(service.requestCode(PHONE)).resolves.toBeUndefined();
    expect(repo.rows[0].channel).toBe(OtpChannel.PHONE);
  });
});
