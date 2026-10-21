import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { UserRole } from '../src/common/enums';
import { RunnersService } from '../src/runners/runners.service';
import { UsersService } from '../src/users/users.service';
import { findInVerificationQueue } from './support/runner-fixtures';
import { withAppendOnlyGuardLifted } from './support/test-database';

/**
 * Owner answers 2026-10-21 for the admin verification inbox (rows 260 to 262,
 * audit A-4, A-5, A-7, A-8):
 *  - Level 2 only when ID front, ID back and selfie are all approved;
 *  - admin items carry the runner's name, short name, areas, level, appliedAt;
 *    `GET /runners/verifications/queue` pages by runner;
 *  - `reviewerNote` optional, trimmed, <= 500 (400 reviewer_note_invalid),
 *    never on a runner-facing response (neither is `reviewedBy`).
 * Every row created here is removed in afterAll.
 */
describe('Verification inbox owner answers (e2e)', () => {
  let app: INestApplication<App>;
  let baseUrl: string;
  const userIds: string[] = [];

  const randomPhone = (): string => `+2547${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;

  type Actor = { id: string; phone: string; token: string; profileId: string };

  const makeUser = async (role: UserRole, displayName?: string): Promise<Actor> => {
    const users = app.get(UsersService);
    const user = await users.create({ phone: randomPhone(), role });
    if (displayName) {
      await users.updateProfile(user.id, { displayName });
    }
    userIds.push(user.id);
    const token = new JwtService().sign(
      { sub: user.id, role: user.role, phone: user.phone, type: 'access' },
      { secret: app.get(ConfigService).get<string>('jwt.accessSecret') as string, expiresIn: '5m' },
    );
    const profileId = role === UserRole.RUNNER ? (await app.get(RunnersService).createForUser(user.id)).id : '';
    return { id: user.id, phone: user.phone, token, profileId };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  let spy: { mockRestore: () => void } | null = null;
  afterEach(() => {
    spy?.mockRestore();
    spy = null;
  });

  afterAll(async () => {
    const ds = app.get(DataSource);
    if (userIds.length > 0) {
      // The ID document access log is append-only (row 154): lift the guard for the cleanup only.
      await withAppendOnlyGuardLifted(ds, 'verification_document_access_log', async (query) => {
        await query(
          `DELETE FROM "verification_document_access_log" WHERE "runnerProfileId" IN
             (SELECT id FROM "runner_profiles" WHERE "userId" = ANY($1))`,
          [userIds],
        );
      });
      for (const table of ['runner_verifications', 'runner_service_areas']) {
        await ds.query(
          `DELETE FROM "${table}" WHERE "runnerProfileId" IN
             (SELECT id FROM "runner_profiles" WHERE "userId" = ANY($1))`,
          [userIds],
        );
      }
      await ds.query('DELETE FROM "notifications" WHERE "userId" = ANY($1)', [userIds]);
      await ds.query('DELETE FROM "runner_profiles" WHERE "userId" = ANY($1)', [userIds]);
      await ds.query('DELETE FROM "users" WHERE "id" = ANY($1)', [userIds]);
    }
    await app.close();
  });

  const http = () => request(baseUrl);
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  const jpeg = (): Buffer => {
    const buf = Buffer.alloc(64, 0);
    buf.set([0xff, 0xd8, 0xff, 0xe0]);
    return buf;
  };

  const upload = async (runner: Actor, type: 'government_id' | 'selfie', side?: 'front' | 'back') => {
    const req = http()
      .post('/api/v1/runners/me/verifications/documents')
      .set(bearer(runner.token))
      .field('verificationType', type);
    if (side) {
      req.field('side', side);
    }
    const res = await req.attach('file', jpeg(), { filename: 'doc.jpg', contentType: 'image/jpeg' }).expect(201);
    return res.body as Record<string, unknown> & { id: string };
  };

  /** ID front, ID back and selfie, uploaded in that order. */
  const application = async (runner: Actor) => ({
    front: (await upload(runner, 'government_id', 'front')).id,
    back: (await upload(runner, 'government_id', 'back')).id,
    selfie: (await upload(runner, 'selfie')).id,
  });

  const decide = (admin: Actor, runner: Actor, id: string, body: Record<string, unknown>) =>
    http().patch(`/api/v1/runners/${runner.profileId}/verifications/${id}`).set(bearer(admin.token)).send(body);

  const levelOf = async (runner: Actor): Promise<string> =>
    (await http().get('/api/v1/runners/me').set(bearer(runner.token)).expect(200)).body.verificationLevel as string;

  type QueueItem = {
    runnerProfile: { id: string; userId: string; verificationLevel: string; serviceAreas: unknown[]; appliedAt: string };
    user: { id: string; phone: string; displayName: string | null; shortName: string | null } | null;
    checks: { id: string; status: string; runnerProfileId: string }[];
    pendingCount: number;
    oldestPendingAt: string | null;
    verification: { verified: boolean; checks: { type: string; side: string | null; status: string }[] };
  };

  /** Walks the whole queue for one filter with a small page size; returns every item in order. */
  const walkQueue = async (admin: Actor, status?: string, limit = 2): Promise<{ items: QueueItem[]; pages: number }> => {
    const items: QueueItem[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res = await http()
        .get('/api/v1/runners/verifications/queue')
        .query({ ...(status ? { status } : {}), limit, ...(cursor ? { cursor } : {}) })
        .set(bearer(admin.token))
        .expect(200);
      expect(res.body.items.length).toBeLessThanOrEqual(limit);
      items.push(...(res.body.items as QueueItem[]));
      cursor = res.body.nextCursor as string | null;
      pages += 1;
    } while (cursor && pages < 200);
    return { items, pages };
  };

  describe('A-4 / row 261: Level 2', () => {
    it('stays 1_basic until front, back and selfie are all approved; the last approval upgrades', async () => {
      const admin = await makeUser(UserRole.ADMIN, 'Verifier');
      const runner = await makeUser(UserRole.RUNNER, 'Kevin Otieno');
      const ids = await application(runner);

      await decide(admin, runner, ids.front, { decision: 'approved' }).expect(200);
      expect(await levelOf(runner)).toBe('1_basic');
      await decide(admin, runner, ids.selfie, { decision: 'approved' }).expect(200);
      expect(await levelOf(runner)).toBe('1_basic');
      const last = await decide(admin, runner, ids.back, { decision: 'approved' }).expect(200);
      expect(last.body.runnerProfile.verificationLevel).toBe('2_id_verified');
      expect(await levelOf(runner)).toBe('2_id_verified');
    });

    it('two approvals landing at once (front and back) still upgrade: the second one sees the first', async () => {
      const admin = await makeUser(UserRole.ADMIN, 'Verifier');
      const second = await makeUser(UserRole.ADMIN, 'Second');
      const runner = await makeUser(UserRole.RUNNER);
      const ids = await application(runner);
      await decide(admin, runner, ids.selfie, { decision: 'approved' }).expect(200);

      const [a, b] = await Promise.all([
        decide(admin, runner, ids.front, { decision: 'approved' }),
        decide(second, runner, ids.back, { decision: 'approved' }),
      ]);
      expect([a.status, b.status]).toEqual([200, 200]);
      expect(await levelOf(runner)).toBe('2_id_verified');
    });

    it('a rejected side keeps the runner at 1_basic; a newer approved re-upload completes the rule', async () => {
      const admin = await makeUser(UserRole.ADMIN, 'Verifier');
      const runner = await makeUser(UserRole.RUNNER);
      const ids = await application(runner);
      await decide(admin, runner, ids.front, { decision: 'approved' }).expect(200);
      await decide(admin, runner, ids.selfie, { decision: 'approved' }).expect(200);
      await decide(admin, runner, ids.back, { decision: 'rejected' }).expect(200);
      expect(await levelOf(runner)).toBe('1_basic');

      const again = (await upload(runner, 'government_id', 'back')).id;
      await decide(admin, runner, again, { decision: 'approved' }).expect(200);
      expect(await levelOf(runner)).toBe('2_id_verified');
    });

    it('two concurrent decisions of one check: one 200, one 409, and the level reflects the winner only', async () => {
      const admin = await makeUser(UserRole.ADMIN, 'Verifier');
      const second = await makeUser(UserRole.ADMIN, 'Second');
      const runner = await makeUser(UserRole.RUNNER);
      const ids = await application(runner);
      await decide(admin, runner, ids.front, { decision: 'approved' }).expect(200);
      await decide(admin, runner, ids.selfie, { decision: 'approved' }).expect(200);

      const results = await Promise.all([
        decide(admin, runner, ids.back, { decision: 'approved' }),
        decide(second, runner, ids.back, { decision: 'rejected' }),
      ]);
      const statuses = results.map((r) => r.status).sort((a, b) => a - b);
      expect(statuses).toEqual([200, 409]);
      const winner = results.find((r) => r.status === 200)!;
      expect(await levelOf(runner)).toBe(winner.body.status === 'approved' ? '2_id_verified' : '1_basic');
    });
  });

  describe('Row 263 (AQ-38): Level 2 follows the newest records both ways', () => {
    /** A runner at 2_id_verified with front, back and selfie approved. */
    const levelTwo = async (admin: Actor) => {
      const runner = await makeUser(UserRole.RUNNER);
      const ids = await application(runner);
      for (const id of [ids.front, ids.back, ids.selfie]) {
        await decide(admin, runner, id, { decision: 'approved' }).expect(200);
      }
      expect(await levelOf(runner)).toBe('2_id_verified');
      return { runner, ids };
    };

    it('a re-upload drops to 1_basic at once; approving it restores 2_id_verified', async () => {
      const admin = await makeUser(UserRole.ADMIN, 'Verifier');
      const { runner } = await levelTwo(admin);
      const selfie = await upload(runner, 'selfie');
      expect(await levelOf(runner)).toBe('1_basic');
      const back = await decide(admin, runner, selfie.id, { decision: 'approved' }).expect(200);
      expect(back.body.runnerProfile.verificationLevel).toBe('2_id_verified');
    });

    it('rejecting the newest record drops to 1_basic; a newer approved re-upload restores it', async () => {
      const admin = await makeUser(UserRole.ADMIN, 'Verifier');
      const { runner } = await levelTwo(admin);
      const front = await upload(runner, 'government_id', 'front');
      const rejected = await decide(admin, runner, front.id, { decision: 'rejected' }).expect(200);
      expect(rejected.body.runnerProfile.verificationLevel).toBe('1_basic');
      const again = await upload(runner, 'government_id', 'front');
      await decide(admin, runner, again.id, { decision: 'approved' }).expect(200);
      expect(await levelOf(runner)).toBe('2_id_verified');
    });

    it('two uploads at once (front and back) both land and leave 1_basic (no deadlock)', async () => {
      const admin = await makeUser(UserRole.ADMIN, 'Verifier');
      const { runner } = await levelTwo(admin);
      const [f, b] = await Promise.all([upload(runner, 'government_id', 'front'), upload(runner, 'government_id', 'back')]);
      expect([f.status, b.status]).toEqual(['pending', 'pending']);
      expect(await levelOf(runner)).toBe('1_basic');
    });

    it('levels 3 and 4 are never changed by an upload or a rejection', async () => {
      const admin = await makeUser(UserRole.ADMIN, 'Verifier');
      const ds = app.get(DataSource);
      for (const level of ['3_trusted', '4_professional']) {
        const { runner } = await levelTwo(admin);
        await ds.query(`UPDATE "runner_profiles" SET "verificationLevel" = $1 WHERE id = $2`, [level, runner.profileId]);
        const selfie = await upload(runner, 'selfie');
        expect(await levelOf(runner)).toBe(level);
        await decide(admin, runner, selfie.id, { decision: 'rejected' }).expect(200);
        expect(await levelOf(runner)).toBe(level);
      }
    });
  });

  describe('Row 263 (AQ-38): unlabelled ID photos from before row 195', () => {
    /** An approved government_id row without a side, as stored before row 195. */
    const legacyId = async (runner: Actor, at: string) =>
      app
        .get(DataSource)
        .query(
          `INSERT INTO "runner_verifications" ("runnerProfileId", "verificationType", status, "createdAt", "reviewedAt")
           VALUES ($1, 'government_id', 'approved', $2, $2)`,
          [runner.profileId, at],
        );
    const idChecks = async (runner: Actor) =>
      ((await http().get('/api/v1/runners/me').set(bearer(runner.token)).expect(200)).body.verification.checks as {
        type: string;
        side: string | null;
        status: string;
      }[]).filter((c) => c.type === 'government_id');

    it('two approved unlabelled records count as front and back: Level 2 on the selfie approval', async () => {
      const admin = await makeUser(UserRole.ADMIN, 'Verifier');
      const runner = await makeUser(UserRole.RUNNER);
      await legacyId(runner, '2026-01-01T08:00:00Z');
      expect(await idChecks(runner)).toEqual([
        { type: 'government_id', side: 'front', status: 'approved' },
        { type: 'government_id', side: 'back', status: 'missing' },
      ]);
      await legacyId(runner, '2026-01-02T08:00:00Z');
      expect((await idChecks(runner)).map((c) => c.status)).toEqual(['approved', 'approved']);
      const selfie = await upload(runner, 'selfie');
      await decide(admin, runner, selfie.id, { decision: 'approved' }).expect(200);
      expect(await levelOf(runner)).toBe('2_id_verified');
    });

    it('one unlabelled plus one labelled side; a newer labelled pending side takes over and downgrades', async () => {
      const admin = await makeUser(UserRole.ADMIN, 'Verifier');
      const runner = await makeUser(UserRole.RUNNER);
      await legacyId(runner, '2026-01-01T08:00:00Z');
      const front = await upload(runner, 'government_id', 'front');
      const selfie = await upload(runner, 'selfie');
      await decide(admin, runner, front.id, { decision: 'approved' }).expect(200);
      const last = await decide(admin, runner, selfie.id, { decision: 'approved' }).expect(200);
      expect(last.body.runnerProfile.verificationLevel).toBe('2_id_verified');

      await upload(runner, 'government_id', 'back');
      expect(await idChecks(runner)).toEqual([
        { type: 'government_id', side: 'front', status: 'approved' },
        { type: 'government_id', side: 'back', status: 'pending' },
      ]);
      expect(await levelOf(runner)).toBe('1_basic');
    });
  });

  describe('N-L1 / RN-L1: level2Missing from the shared rule', () => {
    it('on GET /runners/me, the queue item (verification and runnerProfile) and the PATCH answer', async () => {
      const admin = await makeUser(UserRole.ADMIN, 'Verifier');
      const runner = await makeUser(UserRole.RUNNER);
      const me = async () =>
        (await http().get('/api/v1/runners/me').set(bearer(runner.token)).expect(200)).body.verification.level2Missing;
      expect(await me()).toEqual(['government_id_front', 'government_id_back', 'selfie']);
      const ids = await application(runner);
      const front = await decide(admin, runner, ids.front, { decision: 'approved' }).expect(200);
      expect(front.body.runnerProfile.level2Missing).toEqual(['government_id_back', 'selfie']);
      const item = (await walkQueue(admin, 'pending', 50)).items.find((i) => i.runnerProfile.id === runner.profileId);
      expect((item!.verification as unknown as { level2Missing: string[] }).level2Missing).toEqual([
        'government_id_back',
        'selfie',
      ]);
      expect((item!.runnerProfile as unknown as { level2Missing: string[] }).level2Missing).toEqual([
        'government_id_back',
        'selfie',
      ]);
      await decide(admin, runner, ids.back, { decision: 'approved' }).expect(200);
      const last = await decide(admin, runner, ids.selfie, { decision: 'approved' }).expect(200);
      expect(last.body.runnerProfile).toMatchObject({ verificationLevel: '2_id_verified', level2Missing: [] });
      expect(await me()).toEqual([]);
    });
  });

  describe('A-7, A-8 / row 262: reviewerNote', () => {
    it('trimmed, blank -> null, over 500 is 400 reviewer_note_invalid (check stays pending)', async () => {
      const admin = await makeUser(UserRole.ADMIN, 'Verifier');
      const runner = await makeUser(UserRole.RUNNER);
      const ids = await application(runner);

      const tooLong = await decide(admin, runner, ids.front, { decision: 'rejected', reviewerNote: 'x'.repeat(501) }).expect(400);
      expect(tooLong.body).toMatchObject({ statusCode: 400, code: 'reviewer_note_invalid', maxLength: 500 });
      expect(await findInVerificationQueue(baseUrl, admin.token, ids.front)).toMatchObject({ status: 'pending' });

      // 500 after trimming is fine.
      const ok = await decide(admin, runner, ids.front, {
        decision: 'rejected',
        reviewerNote: `   ${'y'.repeat(500)}   `,
      }).expect(200);
      expect(ok.body.reviewerNote).toBe('y'.repeat(500));

      const blank = await decide(admin, runner, ids.back, { decision: 'approved', reviewerNote: '   ' }).expect(200);
      expect(blank.body.reviewerNote).toBeNull();
    });

    it('never reaches the runner: GET /runners/me/verifications and the POST answers carry no note or reviewer id', async () => {
      const admin = await makeUser(UserRole.ADMIN, 'Verifier');
      const runner = await makeUser(UserRole.RUNNER);
      const uploaded = await upload(runner, 'selfie');
      expect(uploaded).not.toHaveProperty('reviewerNote');
      expect(uploaded).not.toHaveProperty('reviewedBy');
      const added = await http()
        .post('/api/v1/runners/me/verifications')
        .set(bearer(runner.token))
        .send({ verificationType: 'payment_identity' })
        .expect(201);
      expect(added.body).not.toHaveProperty('reviewerNote');
      expect(added.body).not.toHaveProperty('reviewedBy');

      await decide(admin, runner, uploaded.id, { decision: 'rejected', reviewerNote: 'Face not visible' }).expect(200);
      const mine = await http().get('/api/v1/runners/me/verifications').set(bearer(runner.token)).expect(200);
      const selfie = (mine.body as Record<string, unknown>[]).find((v) => v.id === uploaded.id)!;
      expect(selfie).toMatchObject({ status: 'rejected' });
      expect(typeof selfie.reviewedAt).toBe('string');
      for (const v of mine.body as Record<string, unknown>[]) {
        expect(v).not.toHaveProperty('reviewerNote');
        expect(v).not.toHaveProperty('reviewedBy');
      }
      const me = await http().get('/api/v1/runners/me').set(bearer(runner.token)).expect(200);
      expect(JSON.stringify(me.body)).not.toContain('Face not visible');
    });
  });

  describe('A-5 / row 260: runner on admin items and the runner-grouped queue', () => {
    it('list items carry displayName, shortName, level, service areas and appliedAt', async () => {
      const admin = await makeUser(UserRole.ADMIN, 'Verifier');
      const runner = await makeUser(UserRole.RUNNER, 'Mary Wanjiku');
      const config = app.get(ConfigService);
      const original = config.get.bind(config);
      spy = vi.spyOn(config, 'get').mockImplementation(((key: string, def?: unknown) =>
        key === 'runners.serviceAreas'
          ? [{ id: 'westlands', name: 'Westlands', lat: -1.2676, lng: 36.8108, radiusKm: 3 }]
          : original(key, def)) as typeof config.get);
      await http()
        .put('/api/v1/runners/me/service-areas')
        .set(bearer(runner.token))
        .send({ areas: ['westlands'] })
        .expect(200);
      const id = (await upload(runner, 'selfie')).id;

      const item = await findInVerificationQueue(baseUrl, admin.token, id);
      expect(item).toMatchObject({
        runnerProfile: {
          id: runner.profileId,
          userId: runner.id,
          verificationLevel: '1_basic',
          serviceAreas: [{ id: 'westlands', name: 'Westlands' }],
        },
        user: { id: runner.id, phone: runner.phone, displayName: 'Mary Wanjiku', shortName: 'Mary W.' },
      });
      expect(Number.isNaN(Date.parse((item!.runnerProfile as { appliedAt: string }).appliedAt))).toBe(false);
    });

    it('pending: one item per runner, all its checks, oldest pending first, paged by runner', async () => {
      const admin = await makeUser(UserRole.ADMIN, 'Verifier');
      const older = await makeUser(UserRole.RUNNER, 'Older Runner');
      const newer = await makeUser(UserRole.RUNNER, 'Newer Runner');
      const phoneOnly = await makeUser(UserRole.RUNNER, 'Phone Only');
      await app.get(RunnersService).ensurePhoneVerified(older.id);
      await app.get(RunnersService).ensurePhoneVerified(phoneOnly.id);
      const olderIds = await application(older);
      await application(newer);
      await decide(admin, older, olderIds.front, { decision: 'approved' }).expect(200);

      const { items, pages } = await walkQueue(admin, undefined, 1);
      expect(pages).toBeGreaterThanOrEqual(2);
      const mine = items.filter((i) => [older.profileId, newer.profileId, phoneOnly.profileId].includes(i.runnerProfile.id));
      expect(mine.map((i) => i.runnerProfile.id)).toEqual([older.profileId, newer.profileId]);
      // Never split or repeated across pages.
      expect(new Set(items.map((i) => i.runnerProfile.id)).size).toBe(items.length);
      // Ordered by oldest pending across the whole walk.
      const times = items.map((i) => Date.parse(i.oldestPendingAt!));
      expect([...times].sort((a, b) => a - b)).toEqual(times);

      const o = mine[0];
      expect(o.user).toMatchObject({ displayName: 'Older Runner', shortName: 'Older R.' });
      expect(o.checks).toHaveLength(4); // phone, front (approved), back, selfie
      expect(o.checks.every((c) => c.runnerProfileId === older.profileId)).toBe(true);
      expect(o.pendingCount).toBe(2);
      expect(o.verification.checks).toEqual([
        { type: 'phone', side: null, status: 'approved' },
        { type: 'government_id', side: 'front', status: 'approved' },
        { type: 'government_id', side: 'back', status: 'pending' },
        { type: 'selfie', side: null, status: 'pending' },
        { type: 'payment_identity', side: null, status: 'missing' },
      ]);
      expect(mine[1].pendingCount).toBe(3);

      const first = await http()
        .get('/api/v1/runners/verifications/queue')
        .set(bearer(admin.token))
        .expect(200);
      expect(first.body.awaitingReviewCount).toBeGreaterThanOrEqual(2);
      expect(first.body.total).toBe(first.body.awaitingReviewCount);
      // The phone-only runner is in no filter.
      const all = await walkQueue(admin, 'all', 50);
      expect(all.items.some((i) => i.runnerProfile.id === phoneOnly.profileId)).toBe(false);
      expect(all.items.some((i) => i.runnerProfile.id === older.profileId)).toBe(true);
    });

    it('approved = every latest check approved; rejected = any latest check rejected', async () => {
      const admin = await makeUser(UserRole.ADMIN, 'Verifier');
      const done = await makeUser(UserRole.RUNNER);
      const refused = await makeUser(UserRole.RUNNER);
      const d = await application(done);
      for (const id of [d.front, d.back, d.selfie]) {
        await decide(admin, done, id, { decision: 'approved' }).expect(200);
      }
      const r = await application(refused);
      await decide(admin, refused, r.front, { decision: 'rejected' }).expect(200);

      const approved = (await walkQueue(admin, 'approved', 50)).items.map((i) => i.runnerProfile.id);
      const rejected = (await walkQueue(admin, 'rejected', 50)).items.map((i) => i.runnerProfile.id);
      const pending = (await walkQueue(admin, 'pending', 50)).items.map((i) => i.runnerProfile.id);
      expect(approved).toContain(done.profileId);
      expect(approved).not.toContain(refused.profileId);
      expect(rejected).toContain(refused.profileId);
      expect(rejected).not.toContain(done.profileId);
      expect(pending).toContain(refused.profileId);
      expect(pending).not.toContain(done.profileId);

      // A newer approved re-upload replaces the rejected side.
      const again = (await upload(refused, 'government_id', 'front')).id;
      await decide(admin, refused, again, { decision: 'approved' }).expect(200);
      expect((await walkQueue(admin, 'rejected', 50)).items.map((i) => i.runnerProfile.id)).not.toContain(
        refused.profileId,
      );
    });

    it('A-9 / row 264: a double upload of one side counts once, on the newest record', async () => {
      const admin = await makeUser(UserRole.ADMIN, 'Verifier');
      const runner = await makeUser(UserRole.RUNNER, 'Double Upload');
      const ids = await application(runner);
      await decide(admin, runner, ids.back, { decision: 'approved' }).expect(200);
      await decide(admin, runner, ids.selfie, { decision: 'approved' }).expect(200);
      // Same front uploaded again before review: two pending fronts, the newest supersedes the older.
      const again = await upload(runner, 'government_id', 'front');
      const awaiting = async (): Promise<number> =>
        (await http().get('/api/v1/runners/verifications/queue').set(bearer(admin.token)).expect(200)).body
          .awaitingReviewCount as number;
      const find = async (status: string) =>
        (await walkQueue(admin, status, 50)).items.find((i) => i.runnerProfile.id === runner.profileId);

      const pending = await find('pending');
      expect(pending).toBeDefined();
      expect(pending!.checks.filter((c) => c.status === 'pending').map((c) => c.id)).toEqual([again.id, ids.front]);
      expect(pending!.pendingCount).toBe(1);
      expect(Date.parse(pending!.oldestPendingAt!)).toBe(Date.parse(again.createdAt as string));
      const before = await awaiting();

      // Deciding the newest front leaves nothing to decide: out of Pending and of the count.
      await decide(admin, runner, again.id, { decision: 'approved' }).expect(200);
      expect(await levelOf(runner)).toBe('2_id_verified');
      expect(await find('pending')).toBeUndefined();
      expect(await awaiting()).toBe(before - 1);
      const approved = await find('approved');
      expect(approved).toMatchObject({ pendingCount: 0, oldestPendingAt: null });
      // The superseded record is still in the history, still pending.
      expect(approved!.checks.find((c) => c.id === ids.front)?.status).toBe('pending');

      // The superseded record can still be decided; the level and the filters follow the newest record only.
      const old = await decide(admin, runner, ids.front, { decision: 'rejected' }).expect(200);
      expect(old.body).toMatchObject({ id: ids.front, status: 'rejected' });
      expect(await levelOf(runner)).toBe('2_id_verified');
      expect(await find('rejected')).toBeUndefined();
      expect(await find('approved')).toBeDefined();
    });

    it('400 for an unknown status, a bad limit or cursor; 403 for a runner', async () => {
      const admin = await makeUser(UserRole.ADMIN, 'Verifier');
      const runner = await makeUser(UserRole.RUNNER);
      const q = (query: Record<string, unknown>) =>
        http().get('/api/v1/runners/verifications/queue').query(query).set(bearer(admin.token));
      await q({ status: 'in_review' }).expect(400);
      await q({ limit: 0 }).expect(400);
      await q({ limit: 101 }).expect(400);
      const bad = await q({ cursor: 'nope' }).expect(400);
      expect(bad.body).toMatchObject({ code: 'cursor_invalid' });
      await http().get('/api/v1/runners/verifications/queue').set(bearer(runner.token)).expect(403);
    });
  });
});
