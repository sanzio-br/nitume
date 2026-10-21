import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { UserRole } from '../src/common/enums';
import { RunnersService } from '../src/runners/runners.service';
import { UsersService } from '../src/users/users.service';
import { findInVerificationQueue } from './support/runner-fixtures';
import { withAppendOnlyGuardLifted } from './support/test-database';

/**
 * Admin verification review (audit 2026-10-21 "verification inbox", API
 * items A-1, A-2, A-3, A-6):
 * `PATCH /runners/:runnerId/verifications/:verificationId` refuses a check of
 * another runner (404), answers 409 verification_already_decided for a
 * decided check, and returns the same item as `GET /runners/verifications`.
 * Every row created here is removed in afterAll.
 */
describe('Admin verification review (e2e)', () => {
  let app: INestApplication<App>;
  let baseUrl: string;
  const userIds: string[] = [];

  const randomPhone = (): string => `+2547${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;

  type Actor = { id: string; phone: string; token: string; profileId: string | null };

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
    const profileId = role === UserRole.RUNNER ? (await app.get(RunnersService).createForUser(user.id)).id : null;
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
      await ds.query(
        `DELETE FROM "runner_verifications" WHERE "runnerProfileId" IN
           (SELECT id FROM "runner_profiles" WHERE "userId" = ANY($1))`,
        [userIds],
      );
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

  const uploadIdFront = async (runner: Actor): Promise<string> =>
    (
      await http()
        .post('/api/v1/runners/me/verifications/documents')
        .set(bearer(runner.token))
        .field('verificationType', 'government_id')
        .field('side', 'front')
        .attach('file', jpeg(), { filename: 'front.jpg', contentType: 'image/jpeg' })
        .expect(201)
    ).body.id as string;

  const addPaymentIdentity = async (runner: Actor): Promise<string> =>
    (
      await http()
        .post('/api/v1/runners/me/verifications')
        .set(bearer(runner.token))
        .send({ verificationType: 'payment_identity' })
        .expect(201)
    ).body.id as string;

  const decide = (admin: Actor, runnerProfileId: string, id: string, decision: 'approved' | 'rejected') =>
    http()
      .patch(`/api/v1/runners/${runnerProfileId}/verifications/${id}`)
      .set(bearer(admin.token))
      .send({ decision });

  it('A-1: 404 when the verification belongs to another runner; the check stays pending', async () => {
    const admin = await makeUser(UserRole.ADMIN, 'Verifier');
    const owner = await makeUser(UserRole.RUNNER);
    const other = await makeUser(UserRole.RUNNER);
    const id = await uploadIdFront(owner);

    const res = await decide(admin, other.profileId!, id, 'approved').expect(404);
    expect(res.body).toMatchObject({ statusCode: 404, message: 'Verification not found' });
    // An unknown runner id is the same 404.
    await decide(admin, '00000000-0000-4000-8000-000000000000', id, 'approved').expect(404);
    // Malformed ids are 400 (ParseUUIDPipe), never a database error.
    await decide(admin, 'not-a-uuid', id, 'approved').expect(400);
    await decide(admin, owner.profileId!, 'not-a-uuid', 'approved').expect(400);

    const item = await findInVerificationQueue(baseUrl, admin.token, id);
    expect(item).toMatchObject({ status: 'pending', reviewedBy: null });
  });

  it('row 283: a HEIC upload is stored and the admin document link answers (console driver: url null)', async () => {
    const admin = await makeUser(UserRole.ADMIN, 'Verifier');
    const runner = await makeUser(UserRole.RUNNER);
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(52)]);
    const id = (
      await http()
        .post('/api/v1/runners/me/verifications/documents')
        .set(bearer(runner.token))
        .field('verificationType', 'government_id')
        .field('side', 'front')
        .attach('file', heic, { filename: 'front.heic', contentType: 'image/heic' })
        .expect(201)
    ).body.id as string;
    const res = await http().get(`/api/v1/runners/verifications/${id}/document`).set(bearer(admin.token)).expect(200);
    expect(res.body).toEqual({ verificationId: id, url: null, expiresAt: null });
  });

  it('runners cannot decide (403)', async () => {
    const runner = await makeUser(UserRole.RUNNER);
    const id = await addPaymentIdentity(runner);
    await decide(runner, runner.profileId!, id, 'approved').expect(403);
  });

  it('A-3: the PATCH answer is the admin list item (same keys and values)', async () => {
    const admin = await makeUser(UserRole.ADMIN, 'Verifier');
    const runner = await makeUser(UserRole.RUNNER);
    const id = await uploadIdFront(runner);

    const res = await http()
      .patch(`/api/v1/runners/${runner.profileId}/verifications/${id}`)
      .set(bearer(admin.token))
      .send({ decision: 'approved', reviewerNote: 'Clear photo' })
      .expect(200);
    expect(res.body).toMatchObject({
      id,
      runnerProfileId: runner.profileId,
      verificationType: 'government_id',
      side: 'front',
      status: 'approved',
      reviewerNote: 'Clear photo',
      reviewedBy: admin.id,
      purgedAt: null,
      hasDocument: true,
      runnerProfile: { id: runner.profileId, userId: runner.id },
      user: { id: runner.id, phone: runner.phone },
      reviewer: { id: admin.id, displayName: 'Verifier' },
      reReviews: [],
    });
    expect(typeof res.body.reviewedAt).toBe('string');
    expect(typeof res.body.createdAt).toBe('string');
    expect(res.body).not.toHaveProperty('documentS3Key');

    const listed = await findInVerificationQueue(baseUrl, admin.token, id);
    expect(res.body).toEqual(listed);
  });

  it('A-2: deciding a decided check is 409 verification_already_decided with its status', async () => {
    const admin = await makeUser(UserRole.ADMIN, 'Verifier');
    const second = await makeUser(UserRole.ADMIN, 'Second');
    const runner = await makeUser(UserRole.RUNNER);
    const id = await addPaymentIdentity(runner);

    await decide(admin, runner.profileId!, id, 'rejected').expect(200);
    const again = await decide(second, runner.profileId!, id, 'approved').expect(409);
    expect(again.body).toMatchObject({ statusCode: 409, code: 'verification_already_decided', status: 'rejected' });

    const item = await findInVerificationQueue(baseUrl, admin.token, id);
    expect(item).toMatchObject({ status: 'rejected', reviewer: { id: admin.id, displayName: 'Verifier' } });
  });

  it('A-6: every list item carries its runner phone (one batched lookup)', async () => {
    const admin = await makeUser(UserRole.ADMIN, 'Verifier');
    const a = await makeUser(UserRole.RUNNER);
    const b = await makeUser(UserRole.RUNNER);
    const idA = await addPaymentIdentity(a);
    const idB = await addPaymentIdentity(b);
    expect(await findInVerificationQueue(baseUrl, admin.token, idA)).toMatchObject({
      user: { id: a.id, phone: a.phone },
      runnerProfile: { id: a.profileId, userId: a.id },
    });
    expect(await findInVerificationQueue(baseUrl, admin.token, idB)).toMatchObject({
      user: { id: b.id, phone: b.phone },
      runnerProfile: { id: b.profileId, userId: b.id },
    });
  });
});
