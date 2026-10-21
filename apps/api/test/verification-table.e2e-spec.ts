import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { UserRole } from '../src/common/enums';
import { RunnersService } from '../src/runners/runners.service';
import { UsersService } from '../src/users/users.service';
import { withAppendOnlyGuardLifted } from './support/test-database';

/**
 * Row 278 (owner, 2026-10-21): the admin verification table.
 *  - AV-1 `GET /runners/:runnerProfileId/verifications`: one runner in the
 *    queue item shape; 404 runner_not_found; never shadows `me/verifications`.
 *  - AV-2 queue filters `serviceAreaId`, `level`, `q` (name, phone, short id),
 *    AND-combined with `status`; cursor bound to the filter set; `total`
 *    filtered; `awaitingReviewCount` whole queue.
 *  - AV-5 `applicationStatus` (pending > rejected > approved).
 * Areas come from a config spy (one area unique to this run). Every row
 * created here is removed in afterAll.
 */
describe('Verification table (row 278, e2e)', () => {
  let app: INestApplication<App>;
  let baseUrl: string;
  let restoreConfig: (() => void) | null = null;
  const userIds: string[] = [];
  const tag = randomUUID().replace(/-/g, '').slice(0, 8);
  const AREA = `e2e-${tag}`;
  const OTHER_AREA = `e2e-other-${tag}`;

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
    const config = app.get(ConfigService);
    const original = config.get.bind(config);
    const spy = vi.spyOn(config, 'get').mockImplementation(((key: string, def?: unknown) =>
      key === 'runners.serviceAreas'
        ? [
            { id: AREA, name: `Area ${tag}`, lat: -1.28, lng: 36.81, radiusKm: 1 },
            { id: OTHER_AREA, name: `Other ${tag}`, lat: -1.3, lng: 36.7, radiusKm: 1 },
          ]
        : original(key, def)) as typeof config.get);
    restoreConfig = () => spy.mockRestore();
  });

  afterAll(async () => {
    restoreConfig?.();
    const ds = app.get(DataSource);
    if (userIds.length > 0) {
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
    return res.body as { id: string };
  };

  const application = async (runner: Actor) => ({
    front: (await upload(runner, 'government_id', 'front')).id,
    back: (await upload(runner, 'government_id', 'back')).id,
    selfie: (await upload(runner, 'selfie')).id,
  });

  const decide = (admin: Actor, runner: Actor, id: string, decision: 'approved' | 'rejected') =>
    http()
      .patch(`/api/v1/runners/${runner.profileId}/verifications/${id}`)
      .set(bearer(admin.token))
      .send({ decision })
      .expect(200);

  const setAreas = async (runner: Actor, areas: string[]) =>
    http().put('/api/v1/runners/me/service-areas').set(bearer(runner.token)).send({ areas }).expect(200);

  const setLevel = (runner: Actor, level: string) =>
    app.get(DataSource).query(`UPDATE "runner_profiles" SET "verificationLevel" = $2 WHERE id = $1`, [runner.profileId, level]);

  const queue = (admin: Actor, query: Record<string, string | number>) =>
    http().get('/api/v1/runners/verifications/queue').query(query).set(bearer(admin.token));

  type QueueItem = {
    runnerProfile: { id: string; verificationLevel: string; serviceAreas: { id: string; name: string }[] };
    user: { phone: string; displayName: string | null } | null;
    checks: { id: string; status: string }[];
    pendingCount: number;
    applicationStatus: string | null;
  };

  /** Every item for a query, following nextCursor with `limit` 1. */
  const walk = async (admin: Actor, query: Record<string, string>) => {
    const items: QueueItem[] = [];
    let cursor: string | null = null;
    let total = -1;
    let pages = 0;
    do {
      const res = await queue(admin, { ...query, limit: 1, ...(cursor ? { cursor } : {}) }).expect(200);
      items.push(...(res.body.items as QueueItem[]));
      total = res.body.total as number;
      cursor = res.body.nextCursor as string | null;
      pages += 1;
    } while (cursor && pages < 500);
    return { items, total, ids: items.map((i) => i.runnerProfile.id) };
  };

  /** Fixture: three runners in AREA (A level 1 pending, B level 3 pending, D rejected), C elsewhere. */
  let fixture: Promise<{ admin: Actor; a: Actor; b: Actor; c: Actor; d: Actor }> | null = null;
  const world = () =>
    (fixture ??= (async () => {
      const admin = await makeUser(UserRole.ADMIN, 'Verifier');
      const a = await makeUser(UserRole.RUNNER, `Amani Kip${tag}`);
      const b = await makeUser(UserRole.RUNNER, `Baraka 50%_${tag}`);
      const c = await makeUser(UserRole.RUNNER, `Chebet ${tag}`);
      const d = await makeUser(UserRole.RUNNER, `Dalia ${tag}`);
      for (const r of [a, b, c, d]) {
        await application(r);
      }
      await setAreas(a, [AREA]);
      await setAreas(b, [AREA, OTHER_AREA]);
      await setAreas(c, [OTHER_AREA]);
      await setAreas(d, [AREA]);
      await setLevel(b, '3_trusted');
      const dChecks = (await http().get(`/api/v1/runners/${d.profileId}/verifications`).set(bearer(admin.token)).expect(200))
        .body.checks as { id: string }[];
      await decide(admin, d, dChecks[0].id, 'rejected');
      for (const ch of dChecks.slice(1)) {
        await decide(admin, d, ch.id, 'approved');
      }
      return { admin, a, b, c, d };
    })());

  describe('AV-2 filters', () => {
    it('serviceAreaId: only runners with that area; total follows; awaitingReviewCount is the whole queue', async () => {
      const { admin, a, b, c, d } = await world();
      const whole = await queue(admin, { status: 'all' }).expect(200);
      const res = await walk(admin, { status: 'all', serviceAreaId: AREA });
      expect(new Set(res.ids)).toEqual(new Set([a.profileId, b.profileId, d.profileId]));
      expect(res.total).toBe(3);
      expect(res.ids).not.toContain(c.profileId);
      const pending = await queue(admin, { serviceAreaId: AREA }).expect(200);
      expect(pending.body.total).toBe(2);
      expect(pending.body.awaitingReviewCount).toBe(whole.body.awaitingReviewCount);
      expect(pending.body.awaitingReviewCount).toBeGreaterThanOrEqual(3);
    });

    it('level combines with the area and the status (AND)', async () => {
      const { admin, b } = await world();
      const res = await queue(admin, { status: 'pending', serviceAreaId: AREA, level: '3_trusted' }).expect(200);
      expect(res.body.items.map((i: QueueItem) => i.runnerProfile.id)).toEqual([b.profileId]);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0].runnerProfile.verificationLevel).toBe('3_trusted');
      const none = await queue(admin, { status: 'rejected', serviceAreaId: AREA, level: '3_trusted' }).expect(200);
      expect(none.body).toMatchObject({ items: [], total: 0, nextCursor: null });
    });

    it('q matches the display name, case-insensitive and trimmed', async () => {
      const { admin, a } = await world();
      const res = await queue(admin, { status: 'all', q: `  amani KIP${tag.toUpperCase()}  ` }).expect(200);
      expect(res.body.items.map((i: QueueItem) => i.runnerProfile.id)).toEqual([a.profileId]);
      expect(res.body.total).toBe(1);
    });

    it('q treats LIKE wildcards literally', async () => {
      const { admin, b } = await world();
      const res = await walk(admin, { status: 'all', serviceAreaId: AREA, q: '50%_' });
      expect(res.ids).toEqual([b.profileId]);
      const pct = await walk(admin, { status: 'all', serviceAreaId: AREA, q: '%%' });
      expect(pct.ids).toEqual([]);
    });

    it('q matches the phone with 07…, +254…, 254… and spaced input', async () => {
      const { admin, c } = await world();
      const local = c.phone.slice(4); // 7XXXXXXXX
      for (const q of [`0${local}`, c.phone, `254${local}`, `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`]) {
        const res = await queue(admin, { status: 'all', q }).expect(200);
        expect(res.body.items.map((i: QueueItem) => i.runnerProfile.id)).toContain(c.profileId);
      }
    });

    it('q matches the short id #NT-XXXXX (prefix optional, any case)', async () => {
      const { admin, d } = await world();
      const short = d.profileId.replace(/-/g, '').slice(-5).toUpperCase();
      for (const q of [`#NT-${short}`, `nt-${short.toLowerCase()}`, short]) {
        const res = await walk(admin, { status: 'all', serviceAreaId: AREA, q });
        expect(res.ids).toContain(d.profileId);
      }
    });

    it('the cursor is bound to the whole filter set: 400 cursor_invalid when any filter changes', async () => {
      const { admin } = await world();
      const first = await queue(admin, { status: 'all', serviceAreaId: AREA, limit: 1 }).expect(200);
      const cursor = first.body.nextCursor as string;
      expect(cursor).toBeTruthy();
      await queue(admin, { status: 'all', serviceAreaId: AREA, limit: 1, cursor }).expect(200);
      for (const changed of [
        { status: 'all', serviceAreaId: OTHER_AREA },
        { status: 'all', serviceAreaId: AREA, level: '1_basic' },
        { status: 'all', serviceAreaId: AREA, q: 'Amani' },
        { status: 'all' },
        { status: 'pending', serviceAreaId: AREA },
      ] as Record<string, string>[]) {
        const res = await queue(admin, { ...changed, limit: 1, cursor }).expect(400);
        expect(res.body.code).toBe('cursor_invalid');
      }
    });

    it('paging under filters returns each runner once, total = items', async () => {
      const { admin } = await world();
      const res = await walk(admin, { status: 'all', serviceAreaId: AREA });
      expect(new Set(res.ids).size).toBe(res.ids.length);
      expect(res.ids.length).toBe(res.total);
    });

    it('400 with a stable code for an unknown area, level or a bad search', async () => {
      const { admin } = await world();
      expect((await queue(admin, { serviceAreaId: 'nowhere' }).expect(400)).body.code).toBe('service_area_invalid');
      expect((await queue(admin, { level: '5_gold' }).expect(400)).body.code).toBe('level_invalid');
      for (const q of ['a', '   ', 'x'.repeat(65)]) {
        expect((await queue(admin, { q }).expect(400)).body).toMatchObject({
          code: 'search_query_invalid',
          minLength: 2,
          maxLength: 64,
        });
      }
    });

    it('runners cannot read the queue (403)', async () => {
      const { a } = await world();
      await queue(a, { serviceAreaId: AREA }).expect(403);
    });
  });

  describe('AV-5 applicationStatus', () => {
    it('pending > rejected > approved over the newest records', async () => {
      const { admin, a, d } = await world();
      const res = await walk(admin, { status: 'all', serviceAreaId: AREA });
      const of = (id: string) => res.items.find((i) => i.runnerProfile.id === id)?.applicationStatus;
      expect(of(a.profileId)).toBe('pending');
      expect(of(d.profileId)).toBe('rejected');
      // A pending re-upload of the rejected selfie: pending wins.
      await upload(d, 'selfie');
      const again = await http().get(`/api/v1/runners/${d.profileId}/verifications`).set(bearer(admin.token)).expect(200);
      expect(again.body.applicationStatus).toBe('pending');
      await decide(admin, d, again.body.checks[0].id as string, 'approved');
      const done = await http().get(`/api/v1/runners/${d.profileId}/verifications`).set(bearer(admin.token)).expect(200);
      expect(done.body.applicationStatus).toBe('approved');
      const approved = await walk(admin, { status: 'approved', serviceAreaId: AREA });
      expect(approved.items.map((i) => i.applicationStatus)).toEqual(approved.items.map(() => 'approved'));
      expect(approved.ids).toContain(d.profileId);
    });
  });

  describe('AV-1 GET /runners/:runnerProfileId/verifications', () => {
    it('answers the exact queue item of that runner', async () => {
      const { admin, a } = await world();
      const inQueue = await queue(admin, { status: 'all', q: `Amani Kip${tag}` }).expect(200);
      const one = await http().get(`/api/v1/runners/${a.profileId}/verifications`).set(bearer(admin.token)).expect(200);
      expect(one.body).toEqual(inQueue.body.items[0]);
      expect(one.body.checks).toHaveLength(3);
      expect(JSON.stringify(one.body)).not.toMatch(/documentS3Key|"url"/);
    });

    it('a runner with only a phone record still answers, applicationStatus null', async () => {
      const { admin } = await world();
      const phoneOnly = await makeUser(UserRole.RUNNER, `Phone ${tag}`);
      await app
        .get(DataSource)
        .query(
          `INSERT INTO "runner_verifications" ("runnerProfileId", "verificationType", side, status, "reviewedAt")
           VALUES ($1, 'phone', NULL, 'approved', now())`,
          [phoneOnly.profileId],
        );
      const res = await http().get(`/api/v1/runners/${phoneOnly.profileId}/verifications`).set(bearer(admin.token)).expect(200);
      expect(res.body).toMatchObject({ pendingCount: 0, oldestPendingAt: null, applicationStatus: null });
      expect(res.body.checks.map((c: { verificationType: string }) => c.verificationType)).toEqual(['phone']);
      // Not in the queue.
      const listed = await queue(admin, { status: 'all', q: `Phone ${tag}` }).expect(200);
      expect(listed.body.items).toEqual([]);
    });

    it('404 runner_not_found, 400 for a malformed id, 403 for a runner', async () => {
      const { admin, a } = await world();
      const missing = await http().get(`/api/v1/runners/${randomUUID()}/verifications`).set(bearer(admin.token)).expect(404);
      expect(missing.body.code).toBe('runner_not_found');
      await http().get('/api/v1/runners/not-a-uuid/verifications').set(bearer(admin.token)).expect(400);
      await http().get(`/api/v1/runners/${a.profileId}/verifications`).set(bearer(a.token)).expect(403);
    });

    it('does not shadow GET /runners/me/verifications or GET /runners/verifications/queue', async () => {
      const { admin, a } = await world();
      const mine = await http().get('/api/v1/runners/me/verifications').set(bearer(a.token)).expect(200);
      expect(Array.isArray(mine.body)).toBe(true);
      expect(mine.body).toHaveLength(3);
      // The admin hits the runner-only route (403), not the admin one (400 for "me").
      await http().get('/api/v1/runners/me/verifications').set(bearer(admin.token)).expect(403);
      const q = await http().get('/api/v1/runners/verifications/queue').set(bearer(admin.token)).expect(200);
      expect(q.body).toHaveProperty('awaitingReviewCount');
    });
  });
});
