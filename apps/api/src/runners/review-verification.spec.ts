import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../common/api-error';
import { RunnerVerificationType, VerificationLevel, VerificationStatus } from '../common/enums';
import { RunnerProfile } from './runner-profile.entity';
import { RunnerVerification, RunnerVerificationSide } from './runner-verification.entity';
import { RunnersService } from './runners.service';

/**
 * Admin verification review (audit 2026-10-21, A-1, A-2, A-3, A-6): the
 * runner in the path must own the check, a decided check answers 409, the
 * PATCH answer is the admin list item, and the list looks up phones once.
 */
const build = (opts: { raceTo?: VerificationStatus } = {}) => {
  const rows: RunnerVerification[] = [
    Object.assign(new RunnerVerification(), {
      id: 'v-front',
      runnerProfileId: 'rp-1',
      verificationType: RunnerVerificationType.GOVERNMENT_ID,
      side: RunnerVerificationSide.FRONT,
      status: VerificationStatus.PENDING,
      documentS3Key: 'vdoc:jpg:key',
      purgedAt: null,
      reviewerNote: null,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: new Date('2026-10-20T08:00:00Z'),
    }),
    Object.assign(new RunnerVerification(), {
      id: 'v-selfie',
      runnerProfileId: 'rp-2',
      verificationType: RunnerVerificationType.SELFIE,
      side: null,
      status: VerificationStatus.PENDING,
      documentS3Key: null,
      purgedAt: null,
      reviewerNote: null,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: new Date('2026-10-20T07:00:00Z'),
    }),
  ];
  const profiles: Partial<RunnerProfile>[] = [
    { id: 'rp-1', userId: 'u-1', verificationLevel: VerificationLevel.ONE_BASIC },
    { id: 'rp-2', userId: 'u-2', verificationLevel: VerificationLevel.ONE_BASIC },
  ];
  const matches = (row: RunnerVerification, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => (row as unknown as Record<string, unknown>)[k] === v);
  const verificationRepo = {
    findOne: vi.fn(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(rows.find((r) => matches(r, where)) ?? null),
    ),
    update: vi.fn((where: Record<string, unknown>, patch: Partial<RunnerVerification>) => {
      if (opts.raceTo) {
        // Another admin decided between our read and our write.
        const row = rows.find((r) => r.id === where.id);
        if (row) {
          row.status = opts.raceTo;
        }
      }
      const row = rows.find((r) => matches(r, where));
      if (row) {
        Object.assign(row, patch);
      }
      return Promise.resolve({ affected: row ? 1 : 0 });
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
    manager: { getRepository: () => ({ find: vi.fn(() => Promise.resolve([])) }) },
  };
  const profileRepo = {
    find: vi.fn(() => Promise.resolve(profiles)),
    findOne: vi.fn(({ where }: { where: { id: string } }) => Promise.resolve(profiles.find((p) => p.id === where.id) ?? null)),
    save: vi.fn((p: RunnerProfile) => Promise.resolve(p)),
  };
  const users = {
    findById: vi.fn(),
    phones: vi.fn(() =>
      Promise.resolve(
        new Map([
          ['u-1', '+254700000001'],
          ['u-2', '+254700000002'],
        ]),
      ),
    ),
    displayNames: vi.fn(() => Promise.resolve(new Map([['admin-1', 'Verifier']]))),
  };
  const service = new RunnersService(
    profileRepo as never,
    verificationRepo as never,
    {} as never,
    {} as never,
    users as never,
  );
  return { service, rows, profiles, users, verificationRepo, profileRepo };
};

const errorOf = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => e,
  );

describe('PATCH /runners/:runnerId/verifications/:verificationId', () => {
  it('A-1: 404 when the verification belongs to another runner, and nothing changes', async () => {
    const b = build();
    const err = await errorOf(b.service.reviewVerification('rp-2', 'v-front', { decision: 'approved' }, 'admin-1'));
    expect(err).toBeInstanceOf(NotFoundException);
    expect((err as NotFoundException).message).toBe('Verification not found');
    expect(b.verificationRepo.update).not.toHaveBeenCalled();
    expect(b.rows[0].status).toBe(VerificationStatus.PENDING);
    expect(b.profileRepo.save).not.toHaveBeenCalled();
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

  it('A-2: 409 when a second admin decides between the read and the write (conditional update)', async () => {
    const b = build({ raceTo: VerificationStatus.APPROVED });
    const err = await errorOf(b.service.reviewVerification('rp-1', 'v-front', { decision: 'rejected' }, 'admin-1'));
    expect((err as ApiError).getResponse()).toMatchObject({ code: 'verification_already_decided', status: 'approved' });
    expect(b.verificationRepo.update).toHaveBeenCalledWith(
      { id: 'v-front', status: VerificationStatus.PENDING },
      expect.objectContaining({ status: VerificationStatus.REJECTED, reviewedBy: 'admin-1' }),
    );
    expect(b.rows[0].status).toBe(VerificationStatus.APPROVED);
    expect(b.profileRepo.save).not.toHaveBeenCalled();
  });

  it('A-3: answers the admin list item shape, without the storage key', async () => {
    const b = build();
    const view = await b.service.reviewVerification(
      'rp-1',
      'v-front',
      { decision: 'approved', reviewerNote: 'Clear photo' },
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
      runnerProfile: { id: 'rp-1', userId: 'u-1' },
      user: { id: 'u-1', phone: '+254700000001' },
      reviewer: { id: 'admin-1', displayName: 'Verifier' },
      reReviews: [],
    });
    expect(view.reviewedAt).toBeInstanceOf(Date);
    expect(view).not.toHaveProperty('documentS3Key');
    // Level rule unchanged (A-4 waits on the owner).
    expect(b.profileRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'rp-1', verificationLevel: VerificationLevel.TWO_ID_VERIFIED }),
    );
  });

  it('A-3: the PATCH item has exactly the keys of the list item', async () => {
    const b = build();
    const before = (await b.service.listVerificationsForAdmin()).items.find((i) => i.id === 'v-selfie');
    const after = await b.service.reviewVerification('rp-2', 'v-selfie', { decision: 'rejected' }, 'admin-1');
    expect(Object.keys(after).sort()).toEqual(Object.keys(before!).sort());
    expect(after).toMatchObject({ status: 'rejected', hasDocument: false, reviewerNote: null });
  });
});

describe('GET /runners/verifications (A-6)', () => {
  it('looks up every runner phone in one batch, never per profile', async () => {
    const b = build();
    const page = await b.service.listVerificationsForAdmin();
    expect(b.users.phones).toHaveBeenCalledTimes(1);
    expect(b.users.phones).toHaveBeenCalledWith(['u-1', 'u-2']);
    expect(b.users.findById).not.toHaveBeenCalled();
    expect(page.items.map((i) => i.user)).toEqual([
      { id: 'u-1', phone: '+254700000001' },
      { id: 'u-2', phone: '+254700000002' },
    ]);
  });

  it('an empty page makes no lookups', async () => {
    const b = build();
    b.rows.length = 0;
    const page = await b.service.listVerificationsForAdmin();
    expect(page).toEqual({ items: [], nextCursor: null });
    expect(b.users.phones).not.toHaveBeenCalled();
    expect(b.profileRepo.find).not.toHaveBeenCalled();
  });
});
