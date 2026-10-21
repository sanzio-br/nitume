import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../common/api-error';
import { RunnerVerificationType, VerificationLevel, VerificationStatus } from '../common/enums';
import { RunnerProfile } from './runner-profile.entity';
import { RunnerServiceArea } from './runner-skill.entity';
import { RunnerVerification, RunnerVerificationSide } from './runner-verification.entity';
import { RunnersService, reviewerNoteOf, toRunnerVerificationView } from './runners.service';

/**
 * Admin verification review (audit 2026-10-21, A-1 to A-8; owner rows 260 to
 * 262): the runner in the path must own the check, a decided check answers
 * 409, the PATCH answer is the admin list item, Level 2 needs ID front, ID
 * back and selfie approved (one transaction with the decision), the
 * reviewer's note is trimmed and capped and never reaches the runner, and
 * lookups are batched.
 */
type Row = Partial<RunnerVerification> & { id: string; runnerProfileId: string };

const APPLIED = new Date('2026-10-01T06:00:00Z');

const row = (r: Row): RunnerVerification =>
  Object.assign(new RunnerVerification(), {
    side: null,
    status: VerificationStatus.PENDING,
    documentS3Key: null,
    purgedAt: null,
    reviewerNote: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date('2026-10-20T08:00:00Z'),
    ...r,
  });

const build = (opts: { raceTo?: VerificationStatus; extra?: Row[]; areas?: string[] } = {}) => {
  const rows: RunnerVerification[] = [
    row({
      id: 'v-front',
      runnerProfileId: 'rp-1',
      verificationType: RunnerVerificationType.GOVERNMENT_ID,
      side: RunnerVerificationSide.FRONT,
      documentS3Key: 'vdoc:jpg:key',
    }),
    row({
      id: 'v-selfie',
      runnerProfileId: 'rp-2',
      verificationType: RunnerVerificationType.SELFIE,
      createdAt: new Date('2026-10-20T07:00:00Z'),
    }),
    ...(opts.extra ?? []).map(row),
  ];
  const profiles: Partial<RunnerProfile>[] = [
    { id: 'rp-1', userId: 'u-1', verificationLevel: VerificationLevel.ONE_BASIC, createdAt: APPLIED },
    { id: 'rp-2', userId: 'u-2', verificationLevel: VerificationLevel.ONE_BASIC, createdAt: APPLIED },
  ];
  const events: string[] = [];
  const matches = (r: object, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => (r as Record<string, unknown>)[k] === v);
  const verificationRepo = {
    findOne: vi.fn(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(rows.find((r) => matches(r, where)) ?? null),
    ),
    find: vi.fn(({ where }: { where: { runnerProfileId: string } }) =>
      Promise.resolve(rows.filter((r) => r.runnerProfileId === where.runnerProfileId)),
    ),
    update: vi.fn((where: Record<string, unknown>, patch: Partial<RunnerVerification>) => {
      events.push('verification.update');
      if (opts.raceTo) {
        // Another admin decided between our read and our write.
        const raced = rows.find((r) => r.id === where.id);
        if (raced) {
          raced.status = opts.raceTo;
        }
      }
      const hit = rows.find((r) => matches(r, where));
      if (hit) {
        Object.assign(hit, patch);
      }
      return Promise.resolve({ affected: hit ? 1 : 0 });
    }),
    createQueryBuilder: vi.fn(() => {
      const qb = {
        orderBy: () => qb,
        addOrderBy: () => qb,
        limit: () => qb,
        andWhere: () => qb,
        getMany: () => Promise.resolve([...rows]),
      };
      return qb;
    }),
    manager: {} as Record<string, unknown>,
  };
  const profileRepo = {
    find: vi.fn(() => Promise.resolve(profiles)),
    findOne: vi.fn(({ where, lock }: { where: { id: string }; lock?: unknown }) => {
      if (lock) {
        events.push('profile.lock');
      }
      return Promise.resolve(profiles.find((p) => p.id === where.id) ?? null);
    }),
    update: vi.fn((id: string, patch: Partial<RunnerProfile>) => {
      events.push('profile.update');
      Object.assign(profiles.find((p) => p.id === id) ?? {}, patch);
      return Promise.resolve({ affected: 1 });
    }),
    save: vi.fn((p: RunnerProfile) => Promise.resolve(p)),
  };
  const areaRepo = {
    find: vi.fn(() =>
      Promise.resolve((opts.areas ?? []).map((area) => ({ runnerProfileId: 'rp-1', area }) as RunnerServiceArea)),
    ),
  };
  const logRepo = { find: vi.fn(() => Promise.resolve([])) };
  const manager = {
    getRepository: (entity: unknown) =>
      entity === RunnerVerification ? verificationRepo : entity === RunnerProfile ? profileRepo : logRepo,
  };
  let committed = 0;
  const transaction = vi.fn(async (cb: (m: typeof manager) => Promise<unknown>) => {
    const out = await cb(manager);
    committed += 1;
    events.push('commit');
    return out;
  });
  verificationRepo.manager = { ...manager, transaction };
  const users = {
    findById: vi.fn(),
    contacts: vi.fn(() =>
      Promise.resolve(
        new Map([
          ['u-1', { phone: '+254700000001', displayName: 'Mary Wanjiku' }],
          ['u-2', { phone: '+254700000002', displayName: null }],
        ]),
      ),
    ),
    displayNames: vi.fn(() => Promise.resolve(new Map([['admin-1', 'Verifier']]))),
  };
  const config = {
    get: vi.fn((key: string, fallback: unknown) =>
      key === 'runners.serviceAreas'
        ? [
            { id: 'westlands', name: 'Westlands', lat: -1.26, lng: 36.8, radiusKm: 3 },
            { id: 'kilimani', name: 'Kilimani', lat: -1.29, lng: 36.78, radiusKm: 3 },
          ]
        : fallback,
    ),
  };
  const service = new RunnersService(
    profileRepo as never,
    verificationRepo as never,
    {} as never,
    areaRepo as never,
    users as never,
    undefined,
    config as never,
  );
  return {
    service,
    rows,
    profiles,
    users,
    verificationRepo,
    profileRepo,
    areaRepo,
    events,
    transaction,
    committed: () => committed,
  };
};

const errorOf = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => e,
  );

/** rp-1 with ID back and selfie already decided (front pending in `build`). */
const rest = (back: VerificationStatus, selfie: VerificationStatus): Row[] => [
  {
    id: 'v-back',
    runnerProfileId: 'rp-1',
    verificationType: RunnerVerificationType.GOVERNMENT_ID,
    side: RunnerVerificationSide.BACK,
    status: back,
  },
  { id: 'v-selfie-1', runnerProfileId: 'rp-1', verificationType: RunnerVerificationType.SELFIE, status: selfie },
];

describe('PATCH /runners/:runnerId/verifications/:verificationId', () => {
  it('A-1: 404 when the verification belongs to another runner, and nothing changes', async () => {
    const b = build();
    const err = await errorOf(b.service.reviewVerification('rp-2', 'v-front', { decision: 'approved' }, 'admin-1'));
    expect(err).toBeInstanceOf(NotFoundException);
    expect((err as NotFoundException).message).toBe('Verification not found');
    expect(b.verificationRepo.update).not.toHaveBeenCalled();
    expect(b.rows[0].status).toBe(VerificationStatus.PENDING);
    expect(b.profileRepo.update).not.toHaveBeenCalled();
  });

  it('404 for an unknown id', async () => {
    const b = build();
    const err = await errorOf(b.service.reviewVerification('rp-1', 'v-none', { decision: 'rejected' }, 'admin-1'));
    expect(err).toBeInstanceOf(NotFoundException);
  });

  it('A-2: 409 verification_already_decided with the current status', async () => {
    const b = build();
    b.rows[0].status = VerificationStatus.REJECTED;
    const err = await errorOf(b.service.reviewVerification('rp-1', 'v-front', { decision: 'approved' }, 'admin-1'));
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).getStatus()).toBe(409);
    expect((err as ApiError).getResponse()).toMatchObject({
      statusCode: 409,
      code: 'verification_already_decided',
      status: 'rejected',
    });
    expect(b.verificationRepo.update).not.toHaveBeenCalled();
  });

  it('A-2: 409 when a second admin decides between the read and the write; the level is untouched', async () => {
    const b = build({
      raceTo: VerificationStatus.APPROVED,
      extra: rest(VerificationStatus.APPROVED, VerificationStatus.APPROVED),
    });
    const err = await errorOf(b.service.reviewVerification('rp-1', 'v-front', { decision: 'approved' }, 'admin-1'));
    expect((err as ApiError).getResponse()).toMatchObject({ code: 'verification_already_decided', status: 'approved' });
    expect(b.verificationRepo.update).toHaveBeenCalledWith(
      { id: 'v-front', status: VerificationStatus.PENDING },
      expect.objectContaining({ status: VerificationStatus.APPROVED, reviewedBy: 'admin-1' }),
    );
    expect(b.profileRepo.update).not.toHaveBeenCalled();
    expect(b.committed()).toBe(0);
  });

  it('A-3, row 260: answers the admin list item shape with the runner name, areas and level', async () => {
    const b = build({ areas: ['westlands', 'gone'] });
    const view = await b.service.reviewVerification(
      'rp-1',
      'v-front',
      { decision: 'approved', reviewerNote: '  Clear photo  ' },
      'admin-1',
    );
    expect(view).toMatchObject({
      id: 'v-front',
      runnerProfileId: 'rp-1',
      verificationType: 'government_id',
      side: 'front',
      status: 'approved',
      reviewerNote: 'Clear photo',
      reviewedBy: 'admin-1',
      purgedAt: null,
      hasDocument: true,
      runnerProfile: {
        id: 'rp-1',
        userId: 'u-1',
        verificationLevel: '1_basic',
        serviceAreas: [{ id: 'westlands', name: 'Westlands' }],
        appliedAt: APPLIED,
      },
      user: { id: 'u-1', phone: '+254700000001', displayName: 'Mary Wanjiku', shortName: 'Mary W.' },
      reviewer: { id: 'admin-1', displayName: 'Verifier' },
      reReviews: [],
    });
    expect(view.reviewedAt).toBeInstanceOf(Date);
    expect(view).not.toHaveProperty('documentS3Key');
  });

  it('A-3: the PATCH item has exactly the keys of the list item', async () => {
    const b = build();
    const before = (await b.service.listVerificationsForAdmin()).items.find((i) => i.id === 'v-selfie');
    const after = await b.service.reviewVerification('rp-2', 'v-selfie', { decision: 'rejected' }, 'admin-1');
    expect(Object.keys(after).sort()).toEqual(Object.keys(before!).sort());
    expect(after).toMatchObject({ status: 'rejected', hasDocument: false, reviewerNote: null });
    expect(after.user).toEqual({ id: 'u-2', phone: '+254700000002', displayName: null, shortName: null });
  });
});

describe('A-4 / row 261: Level 2 needs ID front, ID back and selfie approved', () => {
  it('one ID side alone no longer upgrades', async () => {
    const b = build();
    const view = await b.service.reviewVerification('rp-1', 'v-front', { decision: 'approved' }, 'admin-1');
    expect(view.status).toBe('approved');
    expect(b.profileRepo.update).not.toHaveBeenCalled();
    expect(b.profiles[0].verificationLevel).toBe(VerificationLevel.ONE_BASIC);
  });

  it('the approval that completes front + back + selfie upgrades, in the same transaction, after the profile lock', async () => {
    const b = build({ extra: rest(VerificationStatus.APPROVED, VerificationStatus.APPROVED) });
    const view = await b.service.reviewVerification('rp-1', 'v-front', { decision: 'approved' }, 'admin-1');
    expect(b.profileRepo.update).toHaveBeenCalledWith('rp-1', { verificationLevel: VerificationLevel.TWO_ID_VERIFIED });
    expect(b.events).toEqual(['verification.update', 'profile.lock', 'profile.update', 'commit']);
    expect(b.transaction).toHaveBeenCalledTimes(1);
    expect(view.runnerProfile?.verificationLevel).toBe('2_id_verified');
  });

  it('approving the selfie last also re-evaluates the rule', async () => {
    const b = build({ extra: rest(VerificationStatus.APPROVED, VerificationStatus.PENDING) });
    b.rows[0].status = VerificationStatus.APPROVED;
    await b.service.reviewVerification('rp-1', 'v-selfie-1', { decision: 'approved' }, 'admin-1');
    expect(b.profiles[0].verificationLevel).toBe(VerificationLevel.TWO_ID_VERIFIED);
  });

  it('the newest record of each side wins: an older approved back with a newer pending back does not count', async () => {
    const b = build({
      extra: [
        ...rest(VerificationStatus.APPROVED, VerificationStatus.APPROVED),
        {
          id: 'v-back-2',
          runnerProfileId: 'rp-1',
          verificationType: RunnerVerificationType.GOVERNMENT_ID,
          side: RunnerVerificationSide.BACK,
          createdAt: new Date('2026-10-21T08:00:00Z'),
        },
      ],
    });
    await b.service.reviewVerification('rp-1', 'v-front', { decision: 'approved' }, 'admin-1');
    expect(b.profileRepo.update).not.toHaveBeenCalled();
  });

  it('A-9: approving an older pending upload superseded by a newer pending one decides it but never upgrades', async () => {
    // Double upload of the front before review: v-front (older) and v-front-2 (newer), both pending.
    const b = build({
      extra: [
        ...rest(VerificationStatus.APPROVED, VerificationStatus.APPROVED),
        {
          id: 'v-front-2',
          runnerProfileId: 'rp-1',
          verificationType: RunnerVerificationType.GOVERNMENT_ID,
          side: RunnerVerificationSide.FRONT,
          createdAt: new Date('2026-10-21T08:00:00Z'),
        },
      ],
    });
    const view = await b.service.reviewVerification('rp-1', 'v-front', { decision: 'approved' }, 'admin-1');
    expect(view.status).toBe('approved');
    expect(b.profileRepo.update).not.toHaveBeenCalled();
    expect(b.profiles[0].verificationLevel).toBe(VerificationLevel.ONE_BASIC);
    // Approving the newest front completes the rule.
    await b.service.reviewVerification('rp-1', 'v-front-2', { decision: 'approved' }, 'admin-1');
    expect(b.profiles[0].verificationLevel).toBe(VerificationLevel.TWO_ID_VERIFIED);
  });

  it('an ID row without a side (older rows, row 195) counts for neither side', async () => {
    const b = build({
      extra: [
        {
          id: 'v-old',
          runnerProfileId: 'rp-1',
          verificationType: RunnerVerificationType.GOVERNMENT_ID,
          status: VerificationStatus.APPROVED,
        },
        {
          id: 'v-selfie-1',
          runnerProfileId: 'rp-1',
          verificationType: RunnerVerificationType.SELFIE,
          status: VerificationStatus.APPROVED,
        },
      ],
    });
    await b.service.reviewVerification('rp-1', 'v-front', { decision: 'approved' }, 'admin-1');
    expect(b.profileRepo.update).not.toHaveBeenCalled();
  });

  it('row 263: rejecting the newest ID side or selfie drops 2_id_verified to 1_basic, in the same transaction', async () => {
    for (const id of ['v-front', 'v-selfie-1']) {
      const b = build({ extra: rest(VerificationStatus.APPROVED, VerificationStatus.PENDING) });
      b.rows[0].status = id === 'v-front' ? VerificationStatus.PENDING : VerificationStatus.APPROVED;
      b.profiles[0].verificationLevel = VerificationLevel.TWO_ID_VERIFIED;
      await b.service.reviewVerification('rp-1', id, { decision: 'rejected' }, 'admin-1');
      expect(b.events).toEqual(['verification.update', 'profile.lock', 'profile.update', 'commit']);
      expect(b.profiles[0].verificationLevel).toBe(VerificationLevel.ONE_BASIC);
    }
  });

  it('row 263: rejecting a superseded older record keeps 2_id_verified (the newest records are all approved)', async () => {
    const b = build({
      extra: [
        ...rest(VerificationStatus.APPROVED, VerificationStatus.APPROVED),
        {
          id: 'v-front-2',
          runnerProfileId: 'rp-1',
          verificationType: RunnerVerificationType.GOVERNMENT_ID,
          side: RunnerVerificationSide.FRONT,
          status: VerificationStatus.APPROVED,
          createdAt: new Date('2026-10-21T08:00:00Z'),
        },
      ],
    });
    b.profiles[0].verificationLevel = VerificationLevel.TWO_ID_VERIFIED;
    await b.service.reviewVerification('rp-1', 'v-front', { decision: 'rejected' }, 'admin-1');
    expect(b.profileRepo.update).not.toHaveBeenCalled();
    expect(b.profiles[0].verificationLevel).toBe(VerificationLevel.TWO_ID_VERIFIED);
  });

  it('row 263: a rejection never touches levels 3 and 4', async () => {
    for (const level of [VerificationLevel.THREE_TRUSTED, VerificationLevel.FOUR_PROFESSIONAL]) {
      const b = build({ extra: rest(VerificationStatus.APPROVED, VerificationStatus.APPROVED) });
      b.profiles[0].verificationLevel = level;
      await b.service.reviewVerification('rp-1', 'v-front', { decision: 'rejected' }, 'admin-1');
      expect(b.profileRepo.update).not.toHaveBeenCalled();
      expect(b.profiles[0].verificationLevel).toBe(level);
    }
  });

  it('a payment identity approval neither locks the profile nor re-evaluates', async () => {
    const b = build({
      extra: [{ id: 'v-pay', runnerProfileId: 'rp-1', verificationType: RunnerVerificationType.PAYMENT_IDENTITY }],
    });
    await b.service.reviewVerification('rp-1', 'v-pay', { decision: 'approved' }, 'admin-1');
    expect(b.events).toEqual(['verification.update', 'commit']);
  });

  it('a runner above Level 1 is never changed', async () => {
    const b = build({ extra: rest(VerificationStatus.APPROVED, VerificationStatus.APPROVED) });
    b.profiles[0].verificationLevel = VerificationLevel.THREE_TRUSTED;
    await b.service.reviewVerification('rp-1', 'v-front', { decision: 'approved' }, 'admin-1');
    expect(b.profileRepo.update).not.toHaveBeenCalled();
  });
});

describe('A-7, A-8 / row 262: reviewerNote', () => {
  it('trims, maps blank to null, keeps up to 500 characters', () => {
    expect(reviewerNoteOf(undefined)).toBeNull();
    expect(reviewerNoteOf(null)).toBeNull();
    expect(reviewerNoteOf('   ')).toBeNull();
    expect(reviewerNoteOf('  Blurry  ')).toBe('Blurry');
    expect(reviewerNoteOf(`  ${'x'.repeat(500)}  `)).toBe('x'.repeat(500));
  });

  it('over 500 after trim is 400 reviewer_note_invalid and nothing is written', async () => {
    const b = build();
    const err = await errorOf(
      b.service.reviewVerification(
        'rp-1',
        'v-front',
        { decision: 'rejected', reviewerNote: 'x'.repeat(501) },
        'admin-1',
      ),
    );
    expect((err as ApiError).getStatus()).toBe(400);
    expect((err as ApiError).getResponse()).toMatchObject({ code: 'reviewer_note_invalid', maxLength: 500 });
    expect(b.verificationRepo.update).not.toHaveBeenCalled();
  });

  it('a blank note is stored as null', async () => {
    const b = build();
    const view = await b.service.reviewVerification(
      'rp-1',
      'v-front',
      { decision: 'rejected', reviewerNote: '  ' },
      'admin-1',
    );
    expect(view.reviewerNote).toBeNull();
  });

  it('the runner-facing view carries neither the note nor the reviewer id', () => {
    const view = toRunnerVerificationView(
      row({
        id: 'v',
        runnerProfileId: 'rp-1',
        verificationType: RunnerVerificationType.SELFIE,
        status: VerificationStatus.REJECTED,
        reviewerNote: 'internal',
        reviewedBy: 'admin-1',
        reviewedAt: new Date(),
      }),
    );
    expect(view).not.toHaveProperty('reviewerNote');
    expect(view).not.toHaveProperty('reviewedBy');
    expect(view).not.toHaveProperty('documentS3Key');
    expect(view).toMatchObject({ id: 'v', status: 'rejected', hasDocument: false });
  });
});

describe('GET /runners/verifications (A-6, row 260)', () => {
  it('looks up users, profiles and areas in one batch each, never per row', async () => {
    const b = build();
    const page = await b.service.listVerificationsForAdmin();
    expect(b.users.contacts).toHaveBeenCalledTimes(1);
    expect(b.users.contacts).toHaveBeenCalledWith(['u-1', 'u-2']);
    expect(b.areaRepo.find).toHaveBeenCalledTimes(1);
    expect(b.profileRepo.find).toHaveBeenCalledTimes(1);
    expect(b.users.findById).not.toHaveBeenCalled();
    expect(page.items.map((i) => i.user?.displayName)).toEqual(['Mary Wanjiku', null]);
  });

  it('an empty page makes no lookups', async () => {
    const b = build();
    b.rows.length = 0;
    const page = await b.service.listVerificationsForAdmin();
    expect(page).toEqual({ items: [], nextCursor: null });
    expect(b.users.contacts).not.toHaveBeenCalled();
    expect(b.profileRepo.find).not.toHaveBeenCalled();
  });
});

describe('GET /runners/verifications/queue (row 260)', () => {
  it('400 cursor_invalid for an unreadable cursor or one from another filter', async () => {
    const b = build();
    const other = Buffer.from(
      JSON.stringify({ s: 'all', at: '2026-10-20T08:00:00.000000Z', id: '00000000-0000-4000-8000-000000000000' }),
    ).toString('base64url');
    for (const cursor of ['nope', other]) {
      const err = await errorOf(b.service.verificationQueueForAdmin({ status: VerificationStatus.PENDING, cursor }));
      expect((err as ApiError).getResponse()).toMatchObject({ statusCode: 400, code: 'cursor_invalid' });
    }
  });

  it('A-9: pendingCount, oldestPendingAt and the pending filter read the newest record per (type, side)', async () => {
    const b = build();
    const sql: string[] = [];
    (b.verificationRepo as unknown as { query: unknown }).query = vi.fn((q: string) => {
      sql.push(q);
      return Promise.resolve(sql.length === 1 ? [] : [{ total: 0, awaiting: 0 }]);
    });
    await b.service.verificationQueueForAdmin({ status: VerificationStatus.PENDING });
    expect(sql).toHaveLength(2);
    for (const q of sql) {
      const flat = q.replace(/\s+/g, ' ');
      // Counted inside the DISTINCT ON (runner, type, side) "latest" set, never over every record.
      expect(flat).toContain(`SELECT g.id, l."pendingCount", l."oldestPendingAt"`);
      expect(flat).toMatch(/COUNT\(\*\) FILTER \(WHERE latest\.status = 'pending'\)\)::int AS "pendingCount"/);
      expect(flat).toMatch(/MIN\(latest\."createdAt"\) FILTER \(WHERE latest\.status = 'pending'\) AS "oldestPendingAt"/);
      expect(flat).not.toMatch(/FILTER \(WHERE v\.status::text = 'pending'\)/);
    }
    expect(sql[0].replace(/\s+/g, ' ')).toContain('WHERE q."pendingCount" > 0');
    expect(sql[1].replace(/\s+/g, ' ')).toContain(`FILTER (WHERE q."pendingCount" > 0))::int AS awaiting`);
  });
});
