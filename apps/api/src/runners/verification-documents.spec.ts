import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../common/api-error';
import { RunnerVerificationType, VerificationStatus } from '../common/enums';
import { RunnerVerification } from './runner-verification.entity';
import { VerificationDocumentAction } from './verification-document-access-log.entity';
import { RunnersService } from './runners.service';

const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => (e instanceof ApiError ? e.code : String(e)),
  );

const build = (dueIds: string[] = []) => {
  const rows: RunnerVerification[] = [];
  const log: { action: VerificationDocumentAction; actorUserId: string | null; ip: string | null; verificationId: string }[] = [];
  const verificationRepo = {
    create: vi.fn((v: Partial<RunnerVerification>) => v),
    save: vi.fn((v: RunnerVerification) => {
      const row = Object.assign(new RunnerVerification(), { status: VerificationStatus.PENDING, purgedAt: null }, v, {
        id: v.id ?? `v-${rows.length + 1}`,
        createdAt: new Date(),
      });
      rows.push(row);
      return Promise.resolve(row);
    }),
    findOne: vi.fn(({ where }: { where: { id: string } }) => Promise.resolve(rows.find((r) => r.id === where.id) ?? null)),
    update: vi.fn((where: { id: string }, patch: Partial<RunnerVerification>) => {
      const row = rows.find((r) => r.id === where.id && !r.purgedAt);
      if (row) {
        Object.assign(row, patch);
      }
      return Promise.resolve({ affected: row ? 1 : 0 });
    }),
    query: vi.fn(() => Promise.resolve(dueIds.map((id) => ({ id })))),
  };
  const logRepo = {
    create: vi.fn((v: object) => v),
    save: vi.fn((v: (typeof log)[number]) => {
      log.push(v);
      return Promise.resolve(v);
    }),
  };
  const manager = {
    getRepository: (e: { name: string }) => (e.name === 'VerificationDocumentAccessLog' ? logRepo : verificationRepo),
  };
  const verifications = {
    ...verificationRepo,
    manager: { ...manager, transaction: vi.fn((fn: (m: unknown) => unknown) => fn(manager)) },
  };
  const profiles = { findOne: vi.fn(() => Promise.resolve({ id: 'rp-1', userId: 'u-run' })) };
  const storage = {
    upload: vi.fn(() => Promise.resolve({ key: 'vdoc:jpg:nitume/runner-verification/rp1/k1' })),
    viewUrl: vi.fn((_k: string, ttl: number) => ({ url: 'https://signed', expiresAt: new Date(Date.now() + ttl * 1000) })),
    destroy: vi.fn(() => Promise.resolve()),
  };
  const config = { get: vi.fn((_k: string, fallback: unknown) => fallback) };
  const service = new RunnersService(
    profiles as never,
    verifications as never,
    {} as never,
    {} as never,
    {} as never,
    storage as never,
    config as never,
  );
  return { service, rows, log, storage, verificationRepo };
};

const image = { buffer: Buffer.from('jpeg-bytes'), mimetype: 'image/jpeg', size: 10 };

describe('RA-7 / row 154: restricted ID and selfie images', () => {
  it('uploads to restricted storage, creates a pending verification, logs the upload and hides the key', async () => {
    const b = build();
    const view = await b.service.uploadVerificationDocument('u-run', RunnerVerificationType.GOVERNMENT_ID, image, '10.0.0.7');
    expect(view).toMatchObject({ verificationType: 'government_id', status: 'pending', hasDocument: true, purgedAt: null });
    expect(view).not.toHaveProperty('documentS3Key');
    expect(b.rows[0].documentS3Key).toBe('vdoc:jpg:nitume/runner-verification/rp1/k1');
    expect(b.log).toEqual([expect.objectContaining({ action: 'upload', actorUserId: 'u-run', ip: '10.0.0.7' })]);
  });

  it('refuses other types, other files, and client-supplied keys', async () => {
    const b = build();
    expect(await codeOf(b.service.uploadVerificationDocument('u-run', RunnerVerificationType.PHONE, image, null))).toBe(
      'verification_type_not_uploadable',
    );
    expect(
      await codeOf(
        b.service.uploadVerificationDocument('u-run', RunnerVerificationType.SELFIE, { ...image, mimetype: 'application/pdf' }, null),
      ),
    ).toBe('verification_document_type_invalid');
    expect(await codeOf(b.service.uploadVerificationDocument('u-run', RunnerVerificationType.SELFIE, undefined, null))).toBe(
      'verification_document_empty',
    );
    expect(await codeOf(b.service.addVerification('u-run', RunnerVerificationType.PAYMENT_IDENTITY, 'someone-elses-key'))).toBe(
      'verification_document_upload_required',
    );
    expect(await codeOf(b.service.addVerification('u-run', RunnerVerificationType.SELFIE))).toBe(
      'verification_document_upload_required',
    );
  });

  it('issues a signed URL of at most 5 minutes to an admin and logs the view with the IP', async () => {
    const b = build();
    const v = await b.service.uploadVerificationDocument('u-run', RunnerVerificationType.SELFIE, image, null);
    const link = await b.service.documentLink(v.id, 'admin-1', '41.90.1.2');
    expect(link.url).toBe('https://signed');
    expect(b.storage.viewUrl).toHaveBeenCalledWith(expect.any(String), 300);
    expect(b.log[1]).toMatchObject({ action: 'view', actorUserId: 'admin-1', ip: '41.90.1.2', verificationId: v.id });
  });

  it('purges due images: deletes the object, nulls the key, records purgedAt, logs it; then 410', async () => {
    const b = build(['v-1']);
    await b.service.uploadVerificationDocument('u-run', RunnerVerificationType.GOVERNMENT_ID, image, null);
    b.rows[0].status = VerificationStatus.APPROVED;
    const now = new Date('2027-11-01T00:00:00Z');
    await expect(b.service.purgeExpiredDocuments(now)).resolves.toEqual(['v-1']);
    expect(b.storage.destroy).toHaveBeenCalledWith('vdoc:jpg:nitume/runner-verification/rp1/k1');
    expect(b.rows[0]).toMatchObject({ documentS3Key: null, purgedAt: now });
    expect(b.log[1]).toMatchObject({ action: 'purge', actorUserId: null });
    expect((b.verificationRepo.query.mock.calls[0] as unknown[])[1]).toEqual([now.toISOString(), 365, 200]);
    expect(await codeOf(b.service.documentLink('v-1', 'admin-1', null))).toBe('verification_document_purged');
    // Running again does nothing.
    await expect(b.service.purgeExpiredDocuments(now)).resolves.toEqual([]);
  });

  it('keeps the row when the storage deletion fails (retried next run)', async () => {
    const b = build(['v-1']);
    await b.service.uploadVerificationDocument('u-run', RunnerVerificationType.SELFIE, image, null);
    b.storage.destroy.mockRejectedValueOnce(new Error('cloud down'));
    await expect(b.service.purgeExpiredDocuments()).resolves.toEqual([]);
    expect(b.rows[0].documentS3Key).not.toBeNull();
  });
});
