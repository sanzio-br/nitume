import { describe, expect, it } from 'vitest';
import { RunnerVerificationType as T, VerificationStatus as S } from '../common/enums';
import { RunnerVerificationSide as Side } from './runner-verification.entity';
import { ID_VERIFIED_CHECKS, REQUIRED_CHECKS, meetsIdVerifiedRule, verificationSummaryOf } from './verification-summary';

/** Row 261: the one shared definition of "ID verified" (Level 2). */
const at = (iso: string) => new Date(iso);
const r = (verificationType: T, side: Side | null, status: S, iso = '2026-10-20T08:00:00Z') => ({
  verificationType,
  side,
  status,
  createdAt: at(iso),
});

describe('meetsIdVerifiedRule', () => {
  const full = [
    r(T.GOVERNMENT_ID, Side.FRONT, S.APPROVED),
    r(T.GOVERNMENT_ID, Side.BACK, S.APPROVED),
    r(T.SELFIE, null, S.APPROVED),
  ];

  it('needs front, back and selfie approved', () => {
    expect(meetsIdVerifiedRule(full)).toBe(true);
    for (let i = 0; i < full.length; i++) {
      expect(meetsIdVerifiedRule(full.filter((_, j) => j !== i))).toBe(false);
    }
  });

  it('phone and payment identity are not part of it', () => {
    expect(meetsIdVerifiedRule([...full, r(T.PAYMENT_IDENTITY, null, S.REJECTED)])).toBe(true);
  });

  it('the newest record of each check wins', () => {
    expect(meetsIdVerifiedRule([...full, r(T.SELFIE, null, S.PENDING, '2026-10-21T08:00:00Z')])).toBe(false);
    expect(
      meetsIdVerifiedRule([
        r(T.GOVERNMENT_ID, Side.FRONT, S.REJECTED, '2026-10-19T08:00:00Z'),
        ...full,
      ]),
    ).toBe(true);
  });

  it('an ID row without a side counts for neither side', () => {
    expect(meetsIdVerifiedRule([r(T.GOVERNMENT_ID, null, S.APPROVED), r(T.SELFIE, null, S.APPROVED)])).toBe(false);
  });

  it('every required-check gate implies it (REQUIRED_CHECKS contains ID_VERIFIED_CHECKS)', () => {
    for (const c of ID_VERIFIED_CHECKS) {
      expect(REQUIRED_CHECKS).toContainEqual(c);
    }
    const all = [...full, r(T.PHONE, null, S.APPROVED), r(T.PAYMENT_IDENTITY, null, S.APPROVED)];
    expect(verificationSummaryOf(all).verified).toBe(true);
    expect(meetsIdVerifiedRule(all)).toBe(true);
  });
});
