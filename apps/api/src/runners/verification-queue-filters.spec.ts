import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../common/api-error';
import { RunnerVerificationType, UserRole, VerificationLevel, VerificationStatus } from '../common/enums';
import { RunnerVerification } from './runner-verification.entity';
import { RunnersService } from './runners.service';
import { queueFilterFingerprint, queueLevelOf, queueSearchOf } from './verification-queue-search';

/**
 * Row 278 (owner, 2026-10-21): the verification table. AV-1 one runner in
 * the queue item shape; AV-2 area / level / search filters with the cursor
 * bound to the whole filter set; AV-5 `applicationStatus`.
 */
const errorOf = (p: Promise<unknown> | (() => unknown)) =>
  (typeof p === 'function' ? Promise.resolve().then(p) : p).then(
    () => null,
    (e: unknown) => e,
  );

const bodyOf = (e: unknown) => (e as ApiError).getResponse();

describe('queueSearchOf (AV-2)', () => {
  it('trims, lower-cases and requires 2-64 characters', () => {
    expect(queueSearchOf(undefined)).toBeNull();
    expect(queueSearchOf('  Mary  ')?.text).toBe('mary');
    for (const q of ['', ' a ', 'x'.repeat(65)]) {
      expect(() => queueSearchOf(q)).toThrow(ApiError);
      try {
        queueSearchOf(q);
      } catch (e) {
        expect(bodyOf(e)).toMatchObject({ statusCode: 400, code: 'search_query_invalid', minLength: 2, maxLength: 64 });
      }
    }
    expect(queueSearchOf('x'.repeat(64))?.text).toHaveLength(64);
  });

  it.each([
    ['0712 345 678', '712345678'],
    ['+254712345678', '712345678'],
    ['254712', '712'],
    ['712-345', '712345'],
    ['07', '7'],
    ['(0)712', '712'],
  ])('normalises phone input %s to the digits %s of the stored +254 form', (q, digits) => {
    expect(queueSearchOf(q)?.phoneDigits).toBe(digits);
  });

  it('is not a phone search when the text has letters', () => {
    expect(queueSearchOf('Mary 07')?.phoneDigits).toBeNull();
  });

  it.each([
    ['#NT-AB12F', 'ab12f'],
    ['nt-ab12f', 'ab12f'],
    ['NTab12f', 'ab12f'],
    ['ab12f', 'ab12f'],
    ['#ab1', 'ab1'],
  ])('reads the short id from %s', (q, part) => {
    expect(queueSearchOf(q)?.shortId).toBe(part);
  });

  it('has no short id part for text that cannot be one (non-hex, or more than 5)', () => {
    expect(queueSearchOf('Mary')?.shortId).toBeNull();
    expect(queueSearchOf('#NT-AB12F9')?.shortId).toBeNull();
  });

  it('level must be one of the four values (400 level_invalid)', () => {
    expect(queueLevelOf(undefined)).toBeNull();
    expect(queueLevelOf('3_trusted')).toBe(VerificationLevel.THREE_TRUSTED);
    try {
      queueLevelOf('5_super');
      expect.unreachable();
    } catch (e) {
      expect(bodyOf(e)).toMatchObject({ statusCode: 400, code: 'level_invalid' });
    }
  });

  it('the fingerprint changes with any filter', () => {
    const base = { status: 'pending', serviceAreaId: null, level: null, search: null };
    const all = [
      base,
      { ...base, status: 'all' },
      { ...base, serviceAreaId: 'cbd' },
      { ...base, level: '1_basic' },
      { ...base, search: 'mary' },
    ].map(queueFilterFingerprint);
    expect(new Set(all).size).toBe(all.length);
    expect(queueFilterFingerprint(base)).toBe(queueFilterFingerprint({ ...base }));
  });
});

type QueryFn = (sql: string, params?: unknown[]) => Promise<unknown[]>;

const harness = (opts: { query?: QueryFn; profileExists?: boolean; checks?: Partial<RunnerVerification>[] } = {}) => {
  const calls: { sql: string; params: unknown[] }[] = [];
  const defaultQuery: QueryFn = (sql) =>
    Promise.resolve(sql.includes('AS total') ? [{ total: 0, awaiting: 7 }] : []);
  const verificationRepo = {
    query: vi.fn((sql: string, params: unknown[] = []) => {
      calls.push({ sql: sql.replace(/\s+/g, ' '), params });
      return (opts.query ?? defaultQuery)(sql, params);
    }),
    find: vi.fn(() => Promise.resolve((opts.checks ?? []).map((c) => Object.assign(new RunnerVerification(), c)))),
  };
  const profile = { id: 'rp-1', userId: 'u-1', verificationLevel: VerificationLevel.ONE_BASIC, createdAt: new Date() };
  const profileRepo = {
    findOne: vi.fn(() => Promise.resolve(opts.profileExists === false ? null : { id: 'rp-1' })),
    find: vi.fn(() => Promise.resolve(opts.profileExists === false ? [] : [profile])),
  };
  const areaRepo = { find: vi.fn(() => Promise.resolve([])) };
  const logRepo = { find: vi.fn(() => Promise.resolve([])) };
  verificationRepo.find.mockName('verifications.find');
  const users = {
    idsMatching: vi.fn(() => Promise.resolve(['u-1', 'u-9'])),
    contacts: vi.fn(() => Promise.resolve(new Map([['u-1', { phone: '+254712345678', displayName: 'Mary Wanjiku' }]]))),
    displayNames: vi.fn(() => Promise.resolve(new Map())),
  };
  const config = {
    get: vi.fn((key: string, fallback: unknown) =>
      key === 'runners.serviceAreas'
        ? [
            { id: 'cbd', name: 'CBD', lat: -1.28, lng: 36.81, radiusKm: 2 },
            { id: 'westlands', name: 'Westlands', lat: -1.26, lng: 36.8, radiusKm: 3 },
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
    undefined as never,
  );
  // reReviewsOf reads the access log through the manager.
  (verificationRepo as unknown as { manager: unknown }).manager = { getRepository: () => logRepo };
  return { service, calls, users, verificationRepo, profileRepo };
};

describe('GET /runners/verifications/queue filters (AV-2)', () => {
  it('without filters: every extra condition is off, no users lookup, awaiting over the whole queue', async () => {
    const h = harness();
    const out = await h.service.verificationQueueForAdmin({});
    expect(out).toEqual({ items: [], nextCursor: null, total: 0, awaitingReviewCount: 7 });
    expect(h.users.idsMatching).not.toHaveBeenCalled();
    expect(h.calls).toHaveLength(2);
    expect(h.calls[0].params.slice(3)).toEqual([null, null, false, [], null]);
    expect(h.calls[1].params).toEqual([null, null, false, [], null]);
    // awaitingReviewCount ignores every filter.
    expect(h.calls[1].sql).toContain(`(COUNT(*) FILTER (WHERE q."pendingCount" > 0))::int AS awaiting`);
  });

  it('binds area, level and search as parameters; never interpolates them', async () => {
    const h = harness();
    await h.service.verificationQueueForAdmin({
      status: 'all',
      serviceAreaId: ' westlands ',
      level: '2_id_verified',
      q: "  #NT-ab12f'; DROP TABLE users; --  ",
    });
    expect(h.users.idsMatching).toHaveBeenCalledWith({
      nameContains: "#nt-ab12f'; drop table users; --",
      phoneDigits: null,
      role: UserRole.RUNNER,
    });
    expect(h.calls[0].params.slice(3)).toEqual(['westlands', '2_id_verified', true, ['u-1', 'u-9'], null]);
    for (const c of h.calls) {
      expect(c.sql).not.toContain('DROP');
      expect(c.sql).not.toContain('westlands');
      expect(c.sql).not.toContain('2_id_verified');
    }
    // total is counted with the same conditions as the page.
    expect(h.calls[1].sql).toMatch(/COUNT\(\*\) FILTER \(WHERE TRUE AND \(\$1::text IS NULL/);
    expect(h.calls[0].sql).toContain('LEFT JOIN "runner_profiles" p ON p.id = q.id');
  });

  it('passes the short id part and the phone digits', async () => {
    const h = harness();
    await h.service.verificationQueueForAdmin({ q: '#NT-AB12F' });
    expect(h.calls[0].params[7]).toBe('ab12f');
    await h.service.verificationQueueForAdmin({ q: '0712 345' });
    expect(h.users.idsMatching).toHaveBeenLastCalledWith({
      nameContains: '0712 345',
      phoneDigits: '712345',
      role: UserRole.RUNNER,
    });
  });

  it('400 service_area_invalid for an id that is not configured', async () => {
    const h = harness();
    const err = await errorOf(h.service.verificationQueueForAdmin({ serviceAreaId: 'mombasa' }));
    expect(bodyOf(err)).toMatchObject({ statusCode: 400, code: 'service_area_invalid', allowed: ['cbd', 'westlands'] });
    expect(h.calls).toHaveLength(0);
  });

  it('400 level_invalid and search_query_invalid before any query', async () => {
    const h = harness();
    expect(bodyOf(await errorOf(h.service.verificationQueueForAdmin({ level: 'gold' })))).toMatchObject({
      code: 'level_invalid',
    });
    expect(bodyOf(await errorOf(h.service.verificationQueueForAdmin({ q: ' x ' })))).toMatchObject({
      code: 'search_query_invalid',
    });
    expect(h.calls).toHaveLength(0);
    expect(h.users.idsMatching).not.toHaveBeenCalled();
  });

  it('the cursor is bound to the whole filter set (400 cursor_invalid on any change)', async () => {
    const id = '00000000-0000-4000-8000-000000000001';
    const pageRows = [
      { id, pendingCount: 1, oldestPendingAt: null, applicationStatus: 'pending', hasReviewable: true, sortKey: '2026-10-20T08:00:00.000000Z' },
      { id: '00000000-0000-4000-8000-000000000002', pendingCount: 1, oldestPendingAt: null, applicationStatus: 'pending', hasReviewable: true, sortKey: '2026-10-20T09:00:00.000000Z' },
    ];
    const h = harness({
      query: (sql) => Promise.resolve(sql.includes('AS total') ? [{ total: 2, awaiting: 2 }] : pageRows.map((r) => ({ ...r }))),
    });
    const filters = { serviceAreaId: 'cbd', level: '1_basic', q: 'Mary' };
    const first = await h.service.verificationQueueForAdmin({ ...filters, limit: 1 });
    expect(first.nextCursor).toBeTruthy();
    const cursor = first.nextCursor as string;
    // Same set (q differs only in case and spaces): accepted.
    await h.service.verificationQueueForAdmin({ ...filters, q: '  MARY ', limit: 1, cursor });
    for (const changed of [
      { ...filters, serviceAreaId: 'westlands' },
      { ...filters, level: '2_id_verified' },
      { ...filters, q: 'Marya' },
      { serviceAreaId: 'cbd', level: '1_basic' },
      { ...filters, status: VerificationStatus.REJECTED },
    ]) {
      const err = await errorOf(h.service.verificationQueueForAdmin({ ...changed, limit: 1, cursor }));
      expect(bodyOf(err)).toMatchObject({ statusCode: 400, code: 'cursor_invalid' });
    }
  });
});

describe('AV-5 applicationStatus', () => {
  it('the SQL derives it with pending > rejected > approved', async () => {
    const h = harness();
    await h.service.verificationQueueForAdmin({});
    expect(h.calls[0].sql).toContain(
      `CASE WHEN l."pendingCount" > 0 THEN 'pending' WHEN l."anyRejected" THEN 'rejected' ELSE 'approved' END AS "applicationStatus"`,
    );
  });

  it('each queue item carries the value from its stats row', async () => {
    const h = harness({
      query: (sql) =>
        Promise.resolve(
          sql.includes('AS total')
            ? [{ total: 1, awaiting: 0 }]
            : [{ id: 'rp-1', pendingCount: 0, oldestPendingAt: null, applicationStatus: 'rejected', hasReviewable: true, sortKey: 'x' }],
        ),
      checks: [
        {
          id: 'v-1',
          runnerProfileId: 'rp-1',
          verificationType: RunnerVerificationType.SELFIE,
          side: null,
          status: VerificationStatus.REJECTED,
          documentS3Key: null,
          createdAt: new Date('2026-10-20T08:00:00Z'),
        },
      ],
    });
    const out = await h.service.verificationQueueForAdmin({ status: 'all' });
    expect(out.items.map((i) => i.applicationStatus)).toEqual(['rejected']);
  });
});

describe('GET /runners/:runnerProfileId/verifications (AV-1)', () => {
  it('404 runner_not_found for an unknown profile, before any stats query', async () => {
    const h = harness({ profileExists: false });
    const err = await errorOf(h.service.verificationQueueItemForAdmin('00000000-0000-4000-8000-000000000009'));
    expect(bodyOf(err)).toMatchObject({ statusCode: 404, code: 'runner_not_found' });
    expect(h.calls).toHaveLength(0);
  });

  it('scans only the one runner (bound id) and keeps phone-only runners', async () => {
    const h = harness();
    await h.service.verificationQueueItemForAdmin('rp-1');
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].params).toEqual(['rp-1']);
    expect(h.calls[0].sql).toContain(`WHERE v."runnerProfileId" = $1::uuid`);
    expect(h.calls[0].sql).not.toContain(`WHERE g."hasReviewable"`);
  });

  it('a runner with no records answers the queue item shape from the profile, applicationStatus null', async () => {
    const h = harness();
    const item = await h.service.verificationQueueItemForAdmin('rp-1');
    expect(item).toMatchObject({
      runnerProfile: { id: 'rp-1', userId: 'u-1', verificationLevel: '1_basic' },
      user: { id: 'u-1', displayName: 'Mary Wanjiku', shortName: 'Mary W.' },
      checks: [],
      pendingCount: 0,
      oldestPendingAt: null,
      applicationStatus: null,
    });
    expect(item.verification).toBeDefined();
  });

  it('a phone-only runner: applicationStatus null even though the SQL row says approved', async () => {
    const h = harness({
      query: () =>
        Promise.resolve([{ id: 'rp-1', pendingCount: 0, oldestPendingAt: null, applicationStatus: 'approved', hasReviewable: false }]),
      checks: [
        {
          id: 'v-phone',
          runnerProfileId: 'rp-1',
          verificationType: RunnerVerificationType.PHONE,
          side: null,
          status: VerificationStatus.APPROVED,
          documentS3Key: null,
          createdAt: new Date('2026-10-20T08:00:00Z'),
        },
      ],
    });
    const item = await h.service.verificationQueueItemForAdmin('rp-1');
    expect(item.applicationStatus).toBeNull();
    expect(item.checks.map((c) => c.id)).toEqual(['v-phone']);
  });
});
