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

  describe('row 263: unlabelled (side = null) ID records from before row 195', () => {
    const selfie = r(T.SELFIE, null, S.APPROVED);
    const idChecks = (rows: ReturnType<typeof r>[]) =>
      verificationSummaryOf(rows)
        .checks.filter((c) => c.type === T.GOVERNMENT_ID)
        .map((c) => [c.side, c.status]);

    it('one approved unlabelled record fills one side only (front first)', () => {
      const rows = [r(T.GOVERNMENT_ID, null, S.APPROVED), selfie];
      expect(meetsIdVerifiedRule(rows)).toBe(false);
      expect(idChecks(rows)).toEqual([
        ['front', 'approved'],
        ['back', 'missing'],
      ]);
    });

    it('two distinct approved unlabelled records satisfy front and back', () => {
      const rows = [r(T.GOVERNMENT_ID, null, S.APPROVED), r(T.GOVERNMENT_ID, null, S.APPROVED, '2026-10-19T08:00:00Z'), selfie];
      expect(meetsIdVerifiedRule(rows)).toBe(true);
      expect(idChecks(rows)).toEqual([
        ['front', 'approved'],
        ['back', 'approved'],
      ]);
    });

    it('one approved unlabelled record plus an approved labelled side satisfies the other side', () => {
      for (const side of [Side.FRONT, Side.BACK]) {
        expect(meetsIdVerifiedRule([r(T.GOVERNMENT_ID, null, S.APPROVED), r(T.GOVERNMENT_ID, side, S.APPROVED), selfie])).toBe(
          true,
        );
      }
    });

    it('a labelled record wins over unlabelled ones for its side, even an older one', () => {
      const rows = [
        r(T.GOVERNMENT_ID, Side.FRONT, S.REJECTED, '2026-10-01T08:00:00Z'),
        r(T.GOVERNMENT_ID, null, S.APPROVED),
        r(T.GOVERNMENT_ID, null, S.APPROVED, '2026-10-19T08:00:00Z'),
        selfie,
      ];
      expect(meetsIdVerifiedRule(rows)).toBe(false);
      expect(idChecks(rows)).toEqual([
        ['front', 'rejected'],
        ['back', 'approved'],
      ]);
      // A new pending labelled side also wins (row 263 downgrade path).
      expect(meetsIdVerifiedRule([...rows.slice(1), r(T.GOVERNMENT_ID, Side.BACK, S.PENDING, '2026-10-21T08:00:00Z')])).toBe(
        false,
      );
    });

    it('pending or rejected unlabelled records fill nothing', () => {
      const rows = [r(T.GOVERNMENT_ID, null, S.PENDING), r(T.GOVERNMENT_ID, null, S.REJECTED), selfie];
      expect(meetsIdVerifiedRule(rows)).toBe(false);
      expect(idChecks(rows)).toEqual([
        ['front', 'missing'],
        ['back', 'missing'],
      ]);
    });

    it('the go-online gate (summary.verified) agrees with the Level 2 rule', () => {
      const rows = [
        r(T.GOVERNMENT_ID, null, S.APPROVED),
        r(T.GOVERNMENT_ID, null, S.APPROVED, '2026-10-19T08:00:00Z'),
        selfie,
        r(T.PHONE, null, S.APPROVED),
        r(T.PAYMENT_IDENTITY, null, S.APPROVED),
      ];
      expect(verificationSummaryOf(rows).verified).toBe(true);
      expect(verificationSummaryOf(rows.slice(1)).verified).toBe(false);
    });
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
